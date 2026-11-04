import { supabaseAdmin } from "../config/supabaseAdmin.js";

// Public hint only: never broadcast identities or trust this as authorization.
// Each receiving client verifies its own account with the authenticated API.
export const accountStatusSignal = {
  async publish() {
    const channel = supabaseAdmin.channel("cs-account-status");
    try {
      await channel.httpSend("account-status-changed", {}, { timeout: 2500 });
    } catch {
      // A realtime outage must not undo the status update. Clients still poll.
      console.warn("Account status signal unavailable; session polling remains active.");
    } finally {
      try { await supabaseAdmin.removeChannel(channel); } catch {}
    }
  },
};
