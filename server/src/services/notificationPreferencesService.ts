import { supabaseAdmin } from "../config/supabaseAdmin.js";

export type NotificationPreferences = {
  notifications_enabled: boolean;
  crime_alerts_enabled: boolean;
};

export function allowsNotification(
  preferences: NotificationPreferences,
  type: string
) {
  return preferences.notifications_enabled &&
    (type !== "nearby_incident" || preferences.crime_alerts_enabled);
}

export const notificationPreferencesService = {
  async get(userId: string) {
    return await supabaseAdmin
      .from("profiles")
      .select("notifications_enabled, crime_alerts_enabled")
      .eq("id", userId)
      .single();
  },

  async update(userId: string, preferences: Partial<NotificationPreferences>) {
    return await supabaseAdmin
      .from("profiles")
      .update(preferences)
      .eq("id", userId)
      .select("notifications_enabled, crime_alerts_enabled")
      .single();
  },
};
