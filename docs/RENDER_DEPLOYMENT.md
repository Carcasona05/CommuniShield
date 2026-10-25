# Backend on Render, frontend on Vercel

## What moves (and what does not)

- **Vercel:** keep the existing Expo web project, rooted at `clients/`.
- **Render:** run the Express API as a Node web service, rooted at `server/`.
- **Supabase:** keep Auth, PostgreSQL, report photos and private candidate artifacts.
- **Upstash:** keep the existing Redis REST service. This app uses its REST client,
  not a generic Redis connection URL.
- **Gemini:** keep the existing API key/settings.
- **Python training:** remains a separate worker; starting the API does not run it.

No database migration or data copying is required just to change the API host.
The four built-in ONNX files are tracked under `server/models/`. Linux-native
ONNX Runtime and Sharp dependencies install on Render; do not upload Windows
`node_modules` or use `--ignore-scripts`/`--omit=optional` for installation.

## Important: choose a service that supports your email

**The current app uses SMTP for device-verification and password-reset codes.**
Render Free blocks outbound ports **25, 465 and 587**. Keeping the current
Gmail/SMTP implementation requires a **paid web service** with provider-supported
SMTP on 465 or 587 (port 25 is blocked on all Render services). Check the current
plan price in Render before creating it; this repository does not provision paid
infrastructure automatically.

If you need Free, first replace SMTP with an email provider's HTTPS API (a
separate change requiring a provider choice and credentials). Otherwise a healthy
API can still fail to deliver login and reset codes. Free also spins down after
15 minutes without inbound traffic and can take about a minute to wake up.

See [Render's current limits](https://render.com/docs/free).

## 1. Create the Render web service

Connect this Git repository in **New > Web Service** and configure:

| Setting | Value |
| --- | --- |
| Runtime / language | Node |
| Root Directory | `server` |
| Build Command | `npm ci --include=dev && npm run build:render` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Instance | Paid if retaining the current SMTP implementation |

`server/.node-version` selects Node 24. `tsx` and TypeScript are currently
development dependencies, so **keep `--include=dev`**, even with
`NODE_ENV=production`. The build type-checks; it does not emit a `dist` folder.
`npm start` executes TypeScript with `tsx`, not nodemon. Do not set a publish
directory for this web service. Let Render supply `PORT`; the listener binds to
`0.0.0.0`.

## 2. Configure Render environment variables

Copy your actual server values from your existing Vercel backend environment
into Render's secret environment settings, not into committed files:

```text
NODE_ENV=production
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
EMAIL_FROM
GEMINI_API_KEY
```

Keep `LOGIN_VERIFICATION_SECRET` unchanged if you use one. Keeping both it and
the service-role key unchanged avoids unnecessary invalidation of device trust.
Also copy any existing optional model flags, Gemini model overrides and Expo
push credentials that you actually use; do not enable new features during the move.

Do not copy a Windows `SENTIMENT_MODEL_DIR` or cache path into Render. The default
built-in model location works. Candidate downloads use a disposable temporary
cache; the private Supabase bucket remains their source of truth. No persistent
disk is required for the existing API's photo/model storage design.

## 3. Verify Render before switching clients

Open `https://YOUR-SERVICE.onrender.com/health`: expect `{"status":"ok"}`.
The root `/` still returns `It is working`. Health is a liveness probe, **not** a
check that Supabase, SMTP, Redis or AI are configured correctly.

Before cutover, use a test client build pointed at the Render API and verify:

- Registration, sign-in from an unrecognized device, code delivery and resend.
- Password-reset code delivery and remembered-device behavior.
- Authenticated report reads, photo uploads and report submission.
- Background sentiment/Gemini results and notifications after submission.
- Admin authorization, maps/hotspots and analytics.
- If enabled, loading an existing supporting candidate from Supabase Storage.

Watch logs and memory under real ONNX/image workloads. A passing liveness probe
does not establish that the smallest instance has enough RAM.

## 4. Point the Vercel frontend at Render

In the **frontend** Vercel project's environment settings, set:

```text
EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com/api
```

Include `/api`, and apply the value to the intended Production/Preview
environments. **Redeploy the frontend**: Expo embeds public values during export.
Keep `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` unchanged.
Never expose backend secrets as public variables.

Native builds now honor the same API environment variable instead of a hardcoded
Vercel URL; rebuild/distribute them (or use your configured update pipeline) too.
For local development, set `clients/.env` to your reachable LAN API URL. With no
configured URL, development retains the existing `192.168.1.37:3000/api` fallback;
production builds must have an explicit URL.

The API currently allows cross-origin requests via `cors()`, so the Vercel origin
works without a proxy or Vercel rewrite. This is unchanged behavior, not an origin
allowlist; consider restricting browser origins separately before production.
Authentication still uses bearer tokens, not cross-site cookies.

## Background work and rollback

`server/app.ts` runs the same Express application exported by `server/api/index.ts`.
The existing background scheduler executes promises on Node and uses Vercel's
`waitUntil` hook where available. It is **not a durable job queue**: crashes,
deploys and restarts can interrupt analysis. Render does not by itself add retries
or guarantee completion; critical work needs a persistent queue/worker.

Keep the Vercel backend active until Render passes end-to-end checks. To roll
back, restore the frontend's `EXPO_PUBLIC_API_URL` to the old Vercel URL and
redeploy it; update native clients as needed. Both APIs use the same database,
so avoid duplicate manual submissions during testing. Remove the old backend
only after the cutover is verified.

The Python training worker needs its own environment and approved baseline assets,
including files ignored by Git. Do not add it to the web service start command.

Reference: [Render Express deployment](https://render.com/docs/deploy-node-express-app).
