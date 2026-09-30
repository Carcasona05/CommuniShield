import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const subscribeToAdminNotifications = (onChange) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof onChange !== "function") {
    return null;
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = supabase.channel("cs-admin-notifications");

    channel.on("broadcast", { event: "admin-notifications-changed" }, () => {
      onChange();
    });

    channel.subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  } catch {
    return null;
  }
};
