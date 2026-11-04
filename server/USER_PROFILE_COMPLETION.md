# Normal User profile gate

## Deployment

Apply `DB_Schema/migrations/user_profile_completion.sql` to the existing database
before deploying the API. Restart the API and reload/rebuild the client. This
change does not apply any live migration automatically. Do not reinstall the
whole database schema.

The additive `profile_location_verifications` table is RLS-protected and available
only to the backend service role. An unavailable table fails verification closed
with 503; it must never silently let incomplete profiles submit content.

## Requirements

Normal Users must have saved first name, last name, username, a real birthdate
(1900 through today), an 11-digit contact number, their authenticated email, and a
manually entered address saved with device-location consent. Middle name is optional. Department and password
are not profile-completion requirements. Admin/Super Admin writes are exempt.

`GET /api/profile/completion` returns an uncached completion checklist.
`POST /api/reports`, `PUT /api/reports/:id`, and
`POST /api/reports/:id/comments` recheck the saved profile server-side before any
content is written. Incomplete requests return 403 with `code: PROFILE_INCOMPLETE`
and missing fields. Browsing, likes, deletion, sign-in and profile editing remain
available subject to their existing authorization rules.

The client preflights posting/commenting/editing before content/photo uploads,
shows a completion modal, and pushes Profile Details without intentionally
clearing the current draft. The user explicitly returns and submits after saving;
there is no automatic submission. Drafts are held by the existing mounted screen,
not persisted; a hard reload or unmount can lose them.

## Address and consent

Location is requested only after the **Address field** is pressed. Declining
permission or failing to get coordinates/save an address does not satisfy
the requirement. Existing manually typed addresses are not grandfathered into
location confirmation. Allowing location unlocks a manual address input; it does
not auto-fill an address. Coordinates stay in screen memory until Save and are
discarded on Cancel or a reload. Generic `/profile` updates cannot set Normal
Users' addresses. Editing an address requires a fresh device-location request.

`PUT /api/profile/location` accepts numeric coordinates, consent acknowledgement,
and a required user-entered address (trimmed, up to 500 characters). It stores that address plus coordinates
and confirmation time in the private table. Completion requires the current
profile address to match that stored record. If a prior location was successfully
confirmed, a later declined refresh does not erase that existing confirmation.

The UI explains that location is stored privately on Save, is not shown on reports,
and is not tracked in the background. No reverse-geocoder receives coordinates in
this flow. This records location consent plus a user-entered address, **not proof
of identity, address accuracy, or residence**.
GPS spoofing or a modified client cannot be ruled out by browser geolocation.
No continuous/background location tracking is added.

Web geolocation requires a secure context: **HTTPS or localhost**. A web app opened
at a plain LAN HTTP URL such as `http://192.168.1.37:8081` may not be allowed to
request location. Serve the client over HTTPS with a compatible secure backend,
use localhost on the same computer, or use the native app with location enabled.

## Tests

From `server/`: `node --import tsx --test src/ProfileCompletion.test.ts`

From the repo root: `node --test tests/clients/profileCompletionGate.test.mjs`

The isolated SQL permission test is
`tests/database/userProfileCompletion.postgres.mjs` (requires PGlite).
