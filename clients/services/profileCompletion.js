import apiClient from "./apiClient";
import { notifyProfileRequirement } from "./profileRequirementEvents";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { notifyCredibilityNotice } from "./credibilityEvents";

async function loadAccess(token) {
  const { data } = await apiClient.get("/credibility/access", { cacheMode: "network", timeout: 15000, headers: { Authorization: `Bearer ${token}` } });
  return token === await AsyncStorage.getItem("access_token") ? data : null;
}

function showSuspensionDisclaimer(access) {
  notifyCredibilityNotice({
    title: "Account suspended",
    message: `Your account is currently suspended. You cannot post reports or add comments while your suspension is active.${access.suspension?.endsAt ? ` Your suspension ends on ${new Date(access.suspension.endsAt).toLocaleString()}.` : ""} Access returns automatically when the suspension ends. View Profile Details for more information.`,
  });
}

// Check on every entry-point tap, without preventing eligible users from reading comments.
export async function ensureNotSuspended() {
  try {
    const token = await AsyncStorage.getItem("access_token");
    if (!token) {
      notifyCredibilityNotice("Please sign in to post or comment.");
      return false;
    }
    const access = await loadAccess(token);
    if (!access) return false;
    if (access.suspended) {
      showSuspensionDisclaimer(access);
      return false;
    }
    return true;
  } catch {
    notifyCredibilityNotice("We could not verify your account access. Please try again.");
    return false;
  }
}

async function hasRequiredPersonalDetails(token) {
  const { data } = await apiClient.get("/profile/completion", { cacheMode: "network", timeout: 15000, headers: { Authorization: `Bearer ${token}` } });
  if (token !== await AsyncStorage.getItem("access_token")) return false;
  if (data?.complete === true) return true;
  notifyProfileRequirement(data?.missing);
  return false;
}

export async function ensureParticipationReady() {
  try {
    const token = await AsyncStorage.getItem("access_token");
    if (!await ensureNotSuspended()) return false;
    if (!token || token !== await AsyncStorage.getItem("access_token")) return false;
    return await hasRequiredPersonalDetails(token);
  } catch {
    notifyCredibilityNotice("We could not verify your personal details. Please try again before posting or commenting.");
    return false;
  }
}

export async function ensureCompleteProfile(action = "report") {
  const token = await AsyncStorage.getItem("access_token");
  if (!token) throw new Error("Please sign in to post or comment.");
  const access = await loadAccess(token);
  if (!access) return false;
  if (access.suspended) {
    showSuspensionDisclaimer(access);
    return false;
  }
  if (await hasRequiredPersonalDetails(token)) {
    const key = action === "comment" ? "commentAllowed" : action === "edit" ? "editAllowed" : "reportAllowed";
    if (access?.[key] === true) return true;
    notifyCredibilityNotice(action === "comment" && access?.commentLimit === 0 ? "Commenting requires a credibility score of at least 40. Verified reports help you recover your score."
        : "You have reached your daily allowance. Limits reset at midnight Philippine time. Your draft has not been submitted.");
    return false;
  }
  return false;
}
