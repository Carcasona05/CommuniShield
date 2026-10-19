# Email sign-in verification

Applies to User, Admin, and Super Admin. An account's first login, an unrecognized
browser/app installation, or a device whose 30-day trust has expired requires a
six-digit email code after its password is validated. Logout does not remove trust.

## Configuration

Uses existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`,
`UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. No database migration is
needed for this feature. Redis must be available; authentication fails closed if
verification storage is unavailable.

An optional `LOGIN_VERIFICATION_SECRET` (at least 32 random characters) can provide
a dedicated encryption/HMAC key. Otherwise a domain-separated key is derived from
the existing server-only Supabase service-role key. Keep the chosen key consistent
across server instances. Never expose it through an `EXPO_PUBLIC_*` variable.

## Flow and safeguards

- Login returns either an approved access token or a challenge, never both.
- Codes expire in 10 minutes, allow five incorrect attempts, and are single-use.
- New codes have an account-wide 60-second cooldown and a five-per-hour limit.
- Redis Lua scripts atomically apply limits and consume challenges.
- Codes and remembered-device proofs are stored as hashes. Pending session tokens
  are encrypted with AES-256-GCM. Passwords are never stored by this feature.
- Native device proofs use Expo SecureStore plus an installation-local marker;
  web proofs use the browser's existing AsyncStorage storage. Proofs are scoped
  to the account, credentials, and revocation version, not guessed from user-agent.
- Protected API routes require a server-approved session. A Supabase password-only
  token cannot skip verification by calling the API directly. This is app-level
  email verification, not Supabase authenticator MFA/AAL2; keep direct database
  access restricted with RLS independently.
- Password resets and password/email changes invalidate remembered devices,
  outstanding challenges, and approved API sessions. Account status and role are
  checked again after successful code entry.
- Registration now directs the user to sign in rather than returning a token.
- Existing sessions must sign in again once when this feature is introduced.
- Production sign-in must use HTTPS. Use only a trusted private LAN for local
  physical-device testing; do not send credentials over a public HTTP connection.

## Local checks

From `server`, run `npm run build` and `npm test`. Verification tests use mocked
Redis and email delivery and do not send real emails or modify live accounts.
From `clients`, run `npm run build:web` to check the web bundle. No command here
deploys the project or starts a persistent Expo development server.

For a manual check, use a test account and the local API: verify the first code,
log out and back in without another code, then try another browser/device and
confirm it requests verification. Test incorrect, expired, and resent codes too.
Physical-device delivery and SecureStore behavior require a manual app test.
