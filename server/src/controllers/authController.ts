import type { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import type { User } from "@supabase/supabase-js";
import { profileService } from "../services/authService.js";
import { isValidEmail, isValidPhone, passwordPolicyError } from "../services/validation.js";
import { notificationService } from "../services/notificationService.js";
import { credibilityService } from "../services/credibilityService.js";
import { reportService } from "../services/reportService.js";
import { LoginVerificationError, loginVerificationService } from "../services/loginVerificationService.js";

type AuthRequest = Request & { user?: User; token?: string };

const detectDevice = (userAgent?: string): string => {
  const ua = userAgent || "";
  if (/mobile|iphone|ipad|android/i.test(ua)) {
    return /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : "Mobile Device";
  }
  if (/samsung/i.test(ua)) return "Samsung Device";
  if (/chrome/i.test(ua)) return "Chrome Browser";
  if (/firefox/i.test(ua)) return "Firefox Browser";
  if (/safari/i.test(ua)) return "Safari Browser";
  return "Unknown Device";
};

export const register = async (req: Request, res: Response) => {
  try {
    const { userName, email, password, termsVersion } = req.body;

    if (!userName || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    if (!termsVersion) {
      return res.status(400).json({ error: "Terms and conditions acceptance is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const passwordError = passwordPolicyError(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { userName },
    });

    if (error) return res.status(400).json({ error: error.message });

    const userId = created.user?.id;
    if (userId) {
      await profileService.recordTermsAcceptance(userId, termsVersion);
    }

    res.json({
      message: "Registered",
      login_required: true,
    });
  } catch (err) {
    console.error("[Register Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  return loginWithDevice(req, res, false);
};

async function loginWithDevice(req: Request, res: Response, admin: boolean) {
  try {
    const { email, password, device_token } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) return res.status(401).json({ error: error.message });
    if (!data.session?.access_token || !data.user.email) return res.status(401).json({ error: "No session token" });
    const { data: profile, error: profileError } = await profileService.getProfile(data.user.id);
    if (profileError || !profile) return res.status(503).json({ error: "Could not check account status. Please try again." });
    if (profile.status === "Disabled") return res.status(403).json({ error: "Your account is disabled. Contact the super admin." });
    if (admin && !["admin", "super_admin"].includes(profile.role)) return res.status(403).json({ error: "Admin access only." });
    if (!admin && profile.role !== "user") return res.status(403).json({ error: "Please use Admin Login for this account." });

    if (!await loginVerificationService.isTrusted(data.user.id, data.user.email, password, device_token)) {
      return res.json(await loginVerificationService.create({
        userId: data.user.id, email: data.user.email, password,
        token: data.session.access_token, admin,
      }));
    }
    await loginVerificationService.approveSession(data.user.id, data.session.access_token);
    await recordLogin(data.user.id, req);
    return res.json({ message: "Login successful", access_token: data.session.access_token,
      user: { ...data.user, name: profile.fullname, role: profile.role } });
  } catch (error) {
    return res.status(error instanceof LoginVerificationError ? error.status : 503)
      .json({ error: error instanceof LoginVerificationError ? error.message : "Sign-in verification is unavailable. Please try again later." });
  }
}

export const adminLogin = async (req: Request, res: Response) => {
  return loginWithDevice(req, res, true);
};

async function recordLogin(userId: string, req: Request) {
  await notificationService.createLoginActivity({ userId, device: detectDevice(req.headers["user-agent"]), isCurrent: true }).catch(() => {});
}

export const verifyLoginCode = async (req: Request, res: Response) => {
  try {
    const { challenge_id, code } = req.body ?? {};
    if (typeof challenge_id !== "string" || !/^[a-f0-9]{64}$/.test(challenge_id) ||
      typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Provide a valid challenge and six-digit code." });
    }
    const challenge = await loginVerificationService.consume(challenge_id, code);
    const { data, error } = await supabase.auth.getUser(challenge.token);
    if (error || data.user?.id !== challenge.userId || data.user.email !== challenge.email) return res.status(401).json({ error: "Session expired or credentials changed. Please sign in again." });
    const { data: profile, error: profileError } = await profileService.getProfile(challenge.userId);
    if (profileError || !profile) return res.status(503).json({ error: "Could not check account status." });
    if (profile.status === "Disabled") return res.status(403).json({ error: "Your account is disabled. Contact the super admin." });
    if (challenge.admin ? !["admin", "super_admin"].includes(profile.role) : profile.role !== "user") return res.status(403).json({ error: "Account access changed. Please sign in again." });
    const deviceToken = await loginVerificationService.remember(challenge.userId, challenge.credentialHash, challenge.epoch);
    await loginVerificationService.approveSession(challenge.userId, challenge.token, challenge.epoch);
    await recordLogin(challenge.userId, req);
    return res.json({ message: "Device verified", access_token: challenge.token, device_token: deviceToken,
      user: { ...data.user, name: profile.fullname, role: profile.role } });
  } catch (error) {
    return res.status(error instanceof LoginVerificationError ? error.status : 503)
      .json({ error: error instanceof LoginVerificationError ? error.message : "Sign-in verification is unavailable. Please try again later." });
  }
};

export const adminRegister = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({ error: "Only super admin can create admins" });
    }

    const { email, password, name, first_name, middle_name, last_name, role, department, phone } = req.body;

    const names = {
      firstName: typeof first_name === "string" ? first_name.trim() : "",
      middleName: typeof middle_name === "string" ? middle_name.trim() : "",
      lastName: typeof last_name === "string" ? last_name.trim() : "",
      fallbackName: typeof name === "string" ? name.trim() : "",
    };

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!names.firstName && !names.lastName && !names.fallbackName) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const passwordError = passwordPolicyError(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    if (phone !== undefined && phone !== null && String(phone).trim() !== "" && !isValidPhone(phone)) {
      return res.status(400).json({ error: "Phone number must be exactly 11 digits" });
    }

    const result = await profileService.createAdmin(email, password, names, role, department, phone);
    if (result.error) return res.status(400).json({ error: result.error.message });

    const { data: actorProfile } = await profileService.getProfile(user.id);

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: actorProfile?.fullname || "Super Admin",
      actionType: "Admin Added",
      title: "Admin account created",
      details: "New account was made by system admin.",
      oldValue: "New Recruit",
      newValue: "New Recruit",
    }).catch(() => {});

    await notificationService
      .notifyAllAdmins({
        type: "admin_account",
        title: "New Account Deployed",
        message: "A new admin account has been added to CommuniShield.",
        priority: "Medium",
        excludeUserId: user.id,
      })
      .catch(() => {});

    res.json({ message: "Admin created successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProfile = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  const { data } = await profileService.getProfile(user.id);

  const meta = user.user_metadata ?? {};
  const fallbackName = meta.userName ?? meta.name ?? user.email ?? "";

  let credibilityScore = 60;
  let credibilityStatus = 3;

  try {
    const { data: credibility, error } =
      await credibilityService.getUserCredibility(user.id);
    if (!error && credibility) {
      credibilityScore = credibility.score;
      credibilityStatus = credibility.level;
    }
  } catch {
    // keep defaults
  }

  res.json({
    name: data?.fullname ?? fallbackName,
    user_name: data?.user_name ?? fallbackName,
    first_name: data?.first_name ?? meta.firstName ?? "",
    middle_name: data?.middle_name ?? meta.middleName ?? "",
    last_name: data?.last_name ?? meta.lastName ?? "",
    phone: data?.phone ?? meta.phone ?? "",
    department: data?.department ?? "",
    birthdate: data?.birthdate ?? null,
    location: data?.location ?? "",
    role: data?.role ?? "user",
    email: user.email,
    credibility_score: credibilityScore,
    credibility_status: credibilityStatus,
  });
};

export const changePassword = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { currentPassword, newPassword } = req.body ?? {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    const passwordError = passwordPolicyError(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: currentPassword,
    });

    if (signInError) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    await loginVerificationService.revokeAll(user.id);
    const { error: updateError } = await profileService.updateAuth(user.id, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({ message: "Password updated successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProfile = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  await profileService.ensureProfile(user.id);

  const { first_name, middle_name, last_name, user_name, phone, birthdate, location, department } =
    req.body ?? {};

  if (phone !== undefined && phone !== null && String(phone).trim() !== "" && !isValidPhone(phone)) {
    return res.status(400).json({ error: "Phone number must be exactly 11 digits" });
  }

  if (first_name !== undefined && !String(first_name ?? "").trim()) {
    return res.status(400).json({ error: "First name cannot be empty" });
  }

  if (last_name !== undefined && !String(last_name ?? "").trim()) {
    return res.status(400).json({ error: "Last name cannot be empty" });
  }

  const updates: Record<string, unknown> = {};
  if (first_name !== undefined) updates.first_name = first_name;
  if (middle_name !== undefined) updates.middle_name = middle_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (user_name !== undefined) updates.user_name = user_name;
  if (phone !== undefined) updates.phone = phone;
  if (birthdate !== undefined) updates.birthdate = birthdate;
  if (location !== undefined) updates.location = location;
  if (department !== undefined) updates.department = department;

  const { data, error } = await profileService.updateProfileFields(
    user.id,
    updates
  );

  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: "Profile updated successfully", data });
};

export const changeEmail = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  const { currentEmail, newEmail } = req.body ?? {};

  if (!currentEmail || !newEmail) {
    return res.status(400).json({ error: "Current and new email are required" });
  }

  if (!isValidEmail(newEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  if (String(currentEmail).toLowerCase() !== String(user.email).toLowerCase()) {
    return res.status(400).json({ error: "Current email does not match" });
  }

  await loginVerificationService.revokeAll(user.id);
  const { error: updateError } = await profileService.updateAuth(user.id, {
    email: newEmail,
  });

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({
    message: "Email update requested. Confirm the change from your new email.",
  });
};

const LATEST_TERMS_VERSION = "1.0";

export const getTermsStatus = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  const { data: latest, error: latestErr } = await profileService.getLatestAcceptedVersion(user.id);

  if (latestErr) {
    return res.status(500).json({ error: "Failed to check terms status" });
  }

  const acceptedVersion = latest?.terms_version ?? null;
  const hasAcceptedLatest = acceptedVersion === LATEST_TERMS_VERSION;

  res.json({
    hasAcceptedLatest,
    acceptedVersion,
    latestVersion: LATEST_TERMS_VERSION,
    acceptedAt: latest?.accepted_at ?? null,
  });
};

export const recordTermsAcceptance = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  const { termsVersion } = req.body ?? {};

  if (!termsVersion) {
    return res.status(400).json({ error: "termsVersion is required" });
  }

  const { error } = await profileService.recordTermsAcceptance(user.id, termsVersion);

  if (error) {
    return res.status(500).json({ error: "Failed to record terms acceptance" });
  }

  res.json({ message: "Terms acceptance recorded" });
};
