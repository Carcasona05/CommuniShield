import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { aiService } from "./aiService.js";
import { sentimentService } from "./sentimentService.js";
import { notificationService } from "./notificationService.js";
import { reportService } from "./reportService.js";
import { toReportCode } from "../utils/toReportCode.js";
import { analysisSnapshots } from "./analysisSnapshots.js";

type Job = { id: string; kind: string; subject_id: string; report_id: string; lease_token: string; attempts: number;
  payload: { actorId?: string; actorName?: string; ownerId?: string; status?: string; verified?: boolean; location?: string } };
const check = (result: { error?: unknown }) => { if (result.error) throw new Error(String(result.error)); };
const migrationError = (error: { code?: string; message: string }) => new Error(
  ["PGRST202", "42P01", "42883"].includes(error.code || "") ? "Apply admin_analysis_jobs.sql before using background analysis." : error.message);
let workers = 0;

export const adminAnalysisJobs = {
  async enqueue(actor: string, reports: string[]) {
    const { data, error } = await supabaseAdmin.rpc("enqueue_admin_analysis", { p_actor: actor, p_reports: reports });
    if (error) throw migrationError(error);
    if (!data) throw new Error("Analysis could not be queued");
    return String(data);
  },
  async progress(batch: string) {
    const { data, error } = await supabaseAdmin.rpc("admin_analysis_progress", { p_batch: batch });
    if (error) throw migrationError(error);
    return data;
  },
  async active(actor: string) {
    const { data, error } = await supabaseAdmin.rpc("active_admin_analysis", { p_actor: actor });
    if (error) throw migrationError(error);
    return data || [];
  },
  async saveStatus(report: string, actor: string, actorName: string, status?: string, verified?: boolean) {
    const { data, error } = await supabaseAdmin.rpc("save_admin_report_status", {
      p_report: report, p_actor: actor, p_actor_name: actorName, p_status: status ?? null, p_verified: verified ?? null,
    });
    if (error) throw migrationError(error);
    if (!data) throw new Error("Status was not saved");
    return data;
  },
  async perform(job: Job): Promise<"succeeded" | "skipped"> {
    if (job.kind === "status_followup") {
      const p = job.payload;
      // Do not broadcast an obsolete status after a later administrator change.
      const { data: current, error } = await supabaseAdmin.from("reports").select("status,is_verified").eq("id", job.report_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!current || current.status !== p.status || current.is_verified !== p.verified) return "skipped";
      if (p.ownerId) check(await notificationService.createNotification({ userId: p.ownerId, type: "report_status",
        title: p.status === "Resolved" ? "Your report was resolved" : p.verified ? "Your report was verified" : `Your report is now "${p.status}"`,
        message: `The admin updated your report. Current status: "${p.status}".`, reportId: job.report_id,
        location: p.location || "", isVerified: p.verified || false }));
      if (p.status !== "Archived") {
        const severity = await reportService.getReportSeverity(job.report_id);
        check(await notificationService.notifyAllAdmins({ type: "log", reportId: job.report_id,
          title: `Report status changed to "${p.status}"`,
          message: `${p.actorName || "Admin"} updated ${toReportCode(job.report_id)} to "${p.status}".`,
          priority: ["Critical", "High"].includes(severity || "") ? "High" : severity === "Low" ? "Low" : "Medium", ...(p.actorId ? { excludeUserId: p.actorId } : {}) }));
      }
      if (p.verified || p.status === "Resolved") {
        const { data: coords, error: coordError } = await reportService.getReportCoords(job.report_id);
        if (coordError) throw new Error(coordError);
        check(await notificationService.notifyNearbyUsers({ reportId: job.report_id, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
          title: p.status === "Resolved" ? "Resolved incident near you" : "Verified incident near you",
          message: `An incident report near you was ${p.status === "Resolved" ? "resolved" : "verified"} by the admin.`, level: "High", ...(p.ownerId ? { excludeUserId: p.ownerId } : {}) }));
      }
      return "succeeded";
    }
    if (job.kind === "credibility") {
      const { data: row, error } = await supabaseAdmin.from("reports")
        .select("id,location,latitude,longitude,details,incident_types(name,incident_categories(name))").eq("id", job.subject_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return "skipped";
      const type = row.incident_types as unknown as { name?: string; incident_categories?: { name?: string } } | null;
      const result = await aiService.analyzeReport(row.id, { incident_category: type?.incident_categories?.name || "", incident_type: type?.name || "Incident",
        location: row.location || "", details: row.details || "", latitude: row.latitude, longitude: row.longitude });
      if (result.status === "failed") throw new Error("Credibility analysis failed");
      return result.status === "skipped" ? "skipped" : "succeeded";
    }
    const result = await sentimentService.analyze(job.kind === "report_sentiment" ? "report" : "comment", job.subject_id, { force: true });
    if (result.status === "failed" || result.status === "pending") throw new Error(result.error_code || `Sentiment ${result.status}`);
    return result.status === "succeeded" ? "succeeded" : "skipped";
  },
  async drain(maxJobs = 1) {
    if (workers >= 2) return;
    workers++;
    try {
    for (let i = 0; i < maxJobs; i++) {
      const { data, error } = await supabaseAdmin.rpc("claim_admin_analysis_job");
      if (error) throw migrationError(error);
      const job = data?.[0] as Job | undefined;
      if (!job) return;
      // Renew leases during long provider calls; completion is fenced by token.
      const heartbeat = setInterval(() => {
        void supabaseAdmin.from("admin_analysis_jobs").update({ lease_until: new Date(Date.now() + 300000).toISOString() })
          .eq("id", job.id).eq("lease_token", job.lease_token).then(result => { if (result.error) console.error("Analysis lease renewal failed", result.error.message); },
            error => { console.error("Analysis lease renewal failed", error); });
      }, 60000);
      heartbeat.unref();
      let state: string = "succeeded", failure: string | null = null;
      try { state = await this.perform(job); }
      catch (error) { failure = error instanceof Error ? error.message : String(error); state = job.attempts >= 3 ? "failed" : "queued"; }
      finally { clearInterval(heartbeat); }
      const { error: saveError } = await supabaseAdmin.from("admin_analysis_jobs").update({ state, last_error: failure,
        updated_at: new Date().toISOString(), lease_token: null, lease_until: null,
        available_at: new Date(Date.now() + (failure ? job.attempts * 15000 : 0)).toISOString(),
      }).eq("id", job.id).eq("lease_token", job.lease_token);
      if (saveError) throw new Error(saveError.message);
      if (job.kind !== "status_followup") analysisSnapshots.invalidate();
    }
    } finally { workers--; }
  },
};
