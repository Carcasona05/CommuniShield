-- Retained supporting candidates only; built-in model usage is not tracked here.
-- use_count is a stored cumulative counter, not daily usage or API billing.
-- Include the full ID so two candidates with the same name have unique X values.
select name || ' [' || id::text || '] / ' || status as x, use_count as y
from public.sentiment_supporting_models
order by use_count desc, created_at desc;
