# Super Admin Settings

The page now contains account/profile and password forms, AI Credibility
Analysis, and three sentiment controls (Local, Gemini, Cebuano Handling).
Unused map, credibility-threshold, and global email/push settings are removed.
Existing in-app notifications and per-user notification preferences are not
changed. Maps retain their page-specific controls and existing defaults.

## Deployment

Deploy/restart the backend and reload/deploy the client. Run
`DB_Schema/migrations/remove_unused_super_admin_settings.sql` in Supabase SQL
Editor to remove only the retired settings rows. No column/table changes are
needed. The assistant has not applied the migration live. The backend ignores
retired rows even before cleanup and does not accept updates to them.

## Saving

Controls update optimistically; each has Saving / Saved / Not saved feedback.
Only that control is locked while its save runs. Failures restore its previous
value and display an error. Background refresh responses are revision-fenced
so they cannot undo a newer edit. Logout/unmount fence late UI/cache updates.
The settings request performs only validation and a small database upsert;
it never calls a model or waits for queued analysis. Existing analysis workers
continue to run independently. Confirmation is retained when disabling.

## AI Credibility Analysis

The existing `ai_scoring_enabled` key controls both the new credibility score
and the AI-written review, which share one analysis call. Disabling skips that
call before image/model work and does not overwrite saved analyses. A queued
job rechecks the setting when it runs; already-running requests may finish.
An unreadable setting fails closed rather than enabling AI by accident.
Human verification, user credibility rewards and sentiment are independent.

## Sentiment

The same local/Gemini switches and raw-confidence policy remain in place.
Local models run on the backend, not on the administrator's device. Cebuano
Handling is retained, including its currently saved mode. Turning Gemini off
does not silently rewrite Cebuano routing: Gemini-only Cebuano is unavailable
until Gemini is enabled or its mode is explicitly changed. No existing
sentiment results or model artifacts are reanalyzed/replaced by settings saves.
