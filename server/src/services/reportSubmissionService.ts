import { aiService } from "./aiService.js";
import { credibilityService } from "./credibilityService.js";
import { notificationService } from "./notificationService.js";
import { sentimentService } from "./sentimentService.js";

export type SubmittedReport = {
  ownerId: string;
  reportId: string;
  incidentCategory: string;
  incidentType: string;
  location: string;
  details: string;
  latitude: number | null;
  longitude: number | null;
};

async function logged<T>(reportId: string, step: string, action: () => Promise<T>): Promise<T | null> {
  try {
    const result = await action();
    // Supabase service methods commonly resolve { error } rather than reject.
    if (result && typeof result === "object" && "error" in result && result.error) {
      console.error(`Report ${reportId} background ${step} failed:`, result.error);
    }
    return result;
  } catch (error) {
    console.error(`Report ${reportId} background ${step} failed:`, error);
    return null;
  }
}

export const reportSubmissionService = {
  async process(input: SubmittedReport) {
    const { ownerId, reportId } = input;
    await Promise.all([
      logged(reportId, "submission points", () => credibilityService.addPoints(ownerId, "report_submitted", "Report submitted", reportId)),
      logged(reportId, "nearby notifications", () => notificationService.notifyNearbyUsers({
        reportId, latitude: input.latitude, longitude: input.longitude,
        title: input.incidentType || "Incident report near you",
        message: `A new "${input.incidentType || "incident"}" report was filed near your location.`,
        level: "Moderate", excludeUserId: ownerId,
      })),
      (async () => {
        // Sentiment is independent: don't delay admin notification on its model.
        const credibility = await logged(reportId, "credibility analysis", () => aiService.analyzeReport(reportId, {
          incident_category: input.incidentCategory, incident_type: input.incidentType,
          location: input.location, details: input.details, latitude: input.latitude, longitude: input.longitude,
        }));
        const priority = ["Critical", "High"].includes(credibility?.severity || "") ? "High" : credibility?.severity === "Low" ? "Low" : "Medium";
        await logged(reportId, "admin notifications", () => notificationService.notifyAllAdmins({
          reportId, title: input.incidentType || "New Incident Report",
          message: `A new "${input.incidentType || "incident"}" report was filed at ${input.location || "an unspecified location"}.`,
          priority, excludeUserId: ownerId,
        }));
      })(),
      logged(reportId, "sentiment analysis", () => sentimentService.analyze("report", reportId)),
    ]);
  },
};
