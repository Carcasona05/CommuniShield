import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { sentimentService } from "./sentimentService.js";

// A trigger queues work in the SAME transaction as comment insertion. SKIP
// LOCKED + lease tokens permit several server instances without duplicate claims.
export const commentSentimentJobs = {
  async drain(maxJobs = 5) {
    for (let i = 0; i < maxJobs; i++) {
      const { data, error } = await supabaseAdmin.rpc("claim_comment_sentiment_job");
      if (error) throw new Error(error.message);
      const job = data?.[0];
      if (!job) return;
      let failure: string | null = null;
      try {
        const result = await sentimentService.analyze("comment", job.comment_id, { force: job.attempts > 1 });
        if (!result) failure = "No analysis result";
        else if (result.status === "pending" || result.status === "failed" || result.status === "unavailable") {
          failure = result.error_code || `Analysis ${result.status}`;
        }
      } catch (error) { failure = error instanceof Error ? error.message : String(error); }
      const { error: updateError } = await supabaseAdmin.from("comment_sentiment_jobs").update({
        lease_token: null, lease_until: null, last_error: failure,
        completed_at: failure ? null : new Date().toISOString(),
        // Retry indefinitely, with capped backoff; never silently lose a job.
        available_at: new Date(Date.now() + (failure ? Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)) * 1000 : 0)).toISOString(),
      }).eq("comment_id", job.comment_id).eq("lease_token", job.lease_token);
      if (updateError) throw new Error(updateError.message);
    }
  },
};
