import crypto from "node:crypto";
import { getRedis } from "../config/redis.js";
import { sendLoginCodeEmail } from "./emailService.js";

const CODE_TTL = 600;
const DEVICE_TTL = 30 * 86400;
const PREFIX = "login-verification:v1:";
export const loginVerificationDependencies = { getRedis, sendEmail: sendLoginCodeEmail };
const storage = () => loginVerificationDependencies.getRedis();

export class LoginVerificationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const key = () => {
  const secret = process.env.LOGIN_VERIFICATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error("Login verification secret is not configured");
  return crypto.createHash("sha256").update(`communishield:login-verification:v1:${secret}`).digest();
};
export const loginHash = (value: string) => crypto.createHmac("sha256", key()).update(value).digest("hex");
const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export const maskLoginEmail = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
};

export function encryptLoginSession(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function decryptLoginSession(value: string) {
  const data = Buffer.from(value, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

type Challenge = {
  userId: string; email: string; admin: boolean; credentialHash: string;
  encryptedToken: string; epoch: string; codeHash: string; attempts: number;
};
type TrustedDevice = { userId: string; credentialHash: string; epoch: string };
type ApprovedSession = { userId: string; epoch: string };

const decode = <T>(raw: T | string): T => typeof raw === "string" ? JSON.parse(raw) : raw;
const epochKey = (userId: string) => `${PREFIX}epoch:${userId}`;
const challengeKey = (id: string) => `${PREFIX}challenge:${id}`;

export const loginVerificationService = {
  async epoch(userId: string) {
    return String(await storage().get(epochKey(userId)) ?? "0");
  },
  async revokeAll(userId: string) {
    // Invalidates both remembered devices and previously approved sessions.
    await storage().set(epochKey(userId), crypto.randomBytes(24).toString("hex"));
  },
  async isTrusted(userId: string, email: string, password: string, deviceToken: unknown) {
    if (typeof deviceToken !== "string" || !/^[a-f0-9]{64}$/.test(deviceToken)) return false;
    const raw = await storage().get<TrustedDevice>(`${PREFIX}device:${tokenHash(deviceToken)}`);
    if (!raw) return false;
    const device = decode<TrustedDevice>(raw);
    return device.userId === userId && device.epoch === await this.epoch(userId) &&
      device.credentialHash === loginHash(JSON.stringify([email, password]));
  },
  async approveSession(userId: string, token: string, expectedEpoch?: string) {
    const epoch = expectedEpoch ?? await this.epoch(userId);
    if (epoch !== await this.epoch(userId)) throw new LoginVerificationError("Credentials changed. Please sign in again.", 401);
    const payload = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString());
    const ttl = Math.floor(Number(payload.exp) - Date.now() / 1000);
    if (!Number.isFinite(ttl) || ttl <= 0) throw new LoginVerificationError("Session expired. Please sign in again.", 401);
    await storage().set(`${PREFIX}session:${tokenHash(token)}`, { userId, epoch }, { ex: ttl });
  },
  async sessionApproved(userId: string, token: string) {
    const raw = await storage().get<ApprovedSession>(`${PREFIX}session:${tokenHash(token)}`);
    if (!raw) return false;
    const session = decode<ApprovedSession>(raw);
    return session.userId === userId && session.epoch === await this.epoch(userId);
  },
  async create(input: { userId: string; email: string; password: string; token: string; admin: boolean }) {
    const redis = storage();
    // Account-wide limits apply even when callers invent new device IDs.
    const allowed = await redis.eval<[], number>(`
      if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
      local count = tonumber(redis.call('GET', KEYS[2]) or '0')
      if count >= 5 then return -1 end
      redis.call('SET', KEYS[1], '1', 'EX', 60)
      redis.call('INCR', KEYS[2])
      if count == 0 then redis.call('EXPIRE', KEYS[2], 3600) end
      return 1
    `, [`${PREFIX}cooldown:${input.userId}`, `${PREFIX}hour:${input.userId}`], []);
    if (allowed !== 1) throw new LoginVerificationError(allowed === 0 ? "Wait 60 seconds before requesting another sign-in code." : "Too many sign-in codes requested. Try again in an hour.", 429);
    const id = crypto.randomBytes(32).toString("hex");
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
    const challenge: Challenge = {
      userId: input.userId, email: input.email, admin: input.admin,
      credentialHash: loginHash(JSON.stringify([input.email, input.password])),
      encryptedToken: encryptLoginSession(input.token), epoch: await this.epoch(input.userId),
      codeHash: loginHash(`${id}:${code}`), attempts: 0,
    };
    await redis.set(challengeKey(id), JSON.stringify(challenge), { ex: CODE_TTL });
    try {
      await loginVerificationDependencies.sendEmail(input.email, code);
    } catch {
      await redis.del(challengeKey(id));
      throw new LoginVerificationError("Could not send the sign-in code. Please try again later.", 503);
    }
    return { verification_required: true, challenge_id: id, masked_email: maskLoginEmail(input.email), expires_in: CODE_TTL, resend_after: 60 };
  },
  async consume(id: string, code: string) {
    // Compare, increment attempts, and consume in one atomic operation.
    const result = await storage().eval<[string], string | number | Challenge>(`
      local raw = redis.call('GET', KEYS[1])
      if not raw then return 0 end
      local entry = cjson.decode(raw)
      if entry.codeHash ~= ARGV[1] then
        entry.attempts = entry.attempts + 1
        if entry.attempts >= 5 then redis.call('DEL', KEYS[1]); return -2 end
        local ttl = redis.call('TTL', KEYS[1])
        if ttl > 0 then redis.call('SET', KEYS[1], cjson.encode(entry), 'EX', ttl) end
        return -1
      end
      redis.call('DEL', KEYS[1])
      return raw
    `, [challengeKey(id)], [loginHash(`${id}:${code}`)]);
    if (typeof result === "number") {
      throw new LoginVerificationError(result === -1 ? "Incorrect sign-in code." : result === -2 ? "Too many incorrect attempts. Request a new code." : "Code expired or already used. Request a new code.");
    }
    const challenge = decode<Challenge>(result);
    if (challenge.epoch !== await this.epoch(challenge.userId)) throw new LoginVerificationError("Credentials changed. Please sign in again.", 401);
    return { ...challenge, token: decryptLoginSession(challenge.encryptedToken) };
  },
  async remember(userId: string, credentialHash: string, epoch: string) {
    if (epoch !== await this.epoch(userId)) throw new LoginVerificationError("Credentials changed. Please sign in again.", 401);
    const deviceToken = crypto.randomBytes(32).toString("hex");
    await storage().set(`${PREFIX}device:${tokenHash(deviceToken)}`, { userId, credentialHash, epoch }, { ex: DEVICE_TTL });
    return deviceToken;
  },
};
