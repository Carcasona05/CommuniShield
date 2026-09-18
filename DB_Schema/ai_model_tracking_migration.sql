-- Migration: Add AI model tracking columns and Gemini configuration settings
-- Run this on existing databases to update schema

-- 1. Add analysis_duration_ms column to report_credibility_analysis
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report_credibility_analysis'
    AND column_name = 'analysis_duration_ms'
  ) THEN
    ALTER TABLE public.report_credibility_analysis
      ADD COLUMN analysis_duration_ms integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Update AI configuration settings to use Gemini
--    (removes Ollama-specific keys, sets Gemini model defaults)
DELETE FROM public.system_settings WHERE key = 'ai_ollama_url';

INSERT INTO public.system_settings (key, value) VALUES
  ('ai_model_name', 'gemini-3.6-flash'),
  ('ai_model_version', 'gemini-3.6-flash'),
  ('ai_temperature', '0.1'),
  ('ai_timeout', '30000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. Verify the changes
SELECT key, value FROM public.system_settings WHERE key LIKE 'ai_%';
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'report_credibility_analysis'
AND column_name = 'analysis_duration_ms';
