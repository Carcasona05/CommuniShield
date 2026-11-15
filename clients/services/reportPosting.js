import apiClient from "./apiClient";
import { sessionData } from "./sessionData";
import { uploadImage } from "./imageUpload";
import { uploadBatch } from "./uploadBatch";
import { triggerRefresh } from "./refreshBus";
import { createReportPosting } from "./reportPostingState";

export const reportPosting = createReportPosting({
  sessions: sessionData,
  // No repeated frontend preflight. POST /reports enforces current account,
  // profile, suspension and allowance rules on every actual submission/retry.
  verify: async () => true,
  upload: (photos, { token, signal, onProgress }) => uploadBatch(photos,
    uri => uploadImage(uri, { expectedToken: token, signal }), { onProgress }),
  async save(draft, photos, { token, signal }) {
    const response = await apiClient.post("/reports", {
      poster_name: draft.posterName,
      display_name_type: draft.displayNameType,
      location: draft.location.trim(),
      latitude: draft.latitude,
      longitude: draft.longitude,
      incident_category: draft.incidentCategory,
      incident_type: draft.incidentType,
      details: draft.details,
      photos,
      status: "Pending Review",
    }, { headers: { Authorization: `Bearer ${token}` }, signal, timeout: 45000 });
    return response.data;
  },
  onSuccess: triggerRefresh,
});
