# Remove the retired custom AI endpoint

Run `remove_ai_api_endpoint.sql` in Supabase SQL Editor and deploy/restart the
backend, then reload/deploy the client. This migration has not been applied live.

`system_settings` has `key`, `value`, and `updated_at` columns. The removed
`ai_api_endpoint` setting is one row, not a column. The migration deletes only
that row, is safe to rerun, and changes no table columns or relationships.

The Super Admin API and Model Settings section, its Model Version input and
placeholder connection-test button are removed. Existing model-version metadata,
model selection, sentiment controls, training and credentials are preserved.
The settings API no longer returns/accepts the retired endpoint key, and
credibility analysis uses the built-in Google Gemini base URL instead of a
database override. Seed SQL no longer recreates the setting.
