import { createClient } from "@supabase/supabase-js";
import { sessionData } from "./sessionData";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let realtimeClient;
const getRealtimeClient = () => {
  if (!realtimeClient) {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return realtimeClient;
};

// This public channel carries no account data. Treat broadcasts as hints only;
// the caller must use /session to authoritatively verify its own account.
export const subscribeToAccountStatusChanges = (onChange) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof onChange !== "function") return null;
  let active = true;
  let timer = null;
  let supabase;
  let channel;
  const scheduleCheck = () => {
    if (!active || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      Promise.resolve().then(() => { if (active) return onChange(); }).catch(() => {});
    }, 150);
  };
  try {
    supabase = getRealtimeClient();
    channel = supabase.channel("cs-account-status");
    channel.on("broadcast", { event: "account-status-changed" }, scheduleCheck);
    channel.subscribe((status) => {
      // Covers changes missed while disconnected, including initial connection.
      if (status === "SUBSCRIBED") scheduleCheck();
    });
  } catch {
    active = false;
    if (timer !== null) clearTimeout(timer);
    if (channel) Promise.resolve().then(() => supabase.removeChannel(channel)).catch(() => {});
    return null;
  }
  return () => {
    active = false;
    if (timer !== null) clearTimeout(timer);
    Promise.resolve().then(() => supabase.removeChannel(channel)).catch(() => {});
  };
};

export const subscribeToAdminNotifications = (onChange) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof onChange !== "function") {
    return null;
  }

  try {
    const supabase = getRealtimeClient();
    const channel = supabase.channel("cs-admin-notifications");

    channel.on("broadcast", { event: "admin-notifications-changed" }, () => {
      sessionData.invalidate({ paths: ["/admin/notifications"] });
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
