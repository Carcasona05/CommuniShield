# Admin account status notifications

Admin and Super Admin layouts listen for the Supabase Broadcast event
`account-status-changed` on `cs-account-status`. Both account-status API write
paths publish this hint after the database update succeeds.

The event contains no account ID, status or other personal data. Receiving clients
check their own authenticated `/api/session`; only a server-confirmed disabled
response shows the blocking Account Disabled modal and clears session data.
Backend authentication continues rejecting disabled accounts on every request.

## Configuration and deployment

- Deploy/restart the API and reload/rebuild the client after updating this code.
- The client needs `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, pointing to the same project as the API's
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never put the service-role key
  in the client.
- Uses Supabase Realtime Broadcast (including the HTTP broadcast endpoint supported
  by the installed SDK); no profiles-table publication or new database policy is
  required. The public hint is not trusted as an authorization decision.

Connected, foreground clients check as soon as the signal arrives (coalesced over
150 ms plus network latency). Checks also run after connection/reconnection and on
focus/resume. The existing 60-second active-screen polling remains a fallback if
Realtime is unavailable or misconfigured. Background/suspended apps cannot promise
instant delivery.

Direct database edits bypass the API broadcast; polling/focus checks still detect
them. This is an in-app modal, not an OS push notification.

## Tests

From the repository root:

```powershell
node --test tests/clients/accountStatusRealtime.test.mjs tests/clients/profileRequests.test.mjs
```

From `server/`:

```powershell
node --import tsx --test ../tests/server/AccountStatusSignal.test.ts
npm run build
```

For a manual end-to-end check, sign in as an admin in one browser/session and a
super admin in another. Disable the admin through account management; the admin's
foreground session should show Account Disabled without waiting for the next
poll. Repeat with Realtime disconnected to verify the polling fallback. Re-enable
the test account afterward.
