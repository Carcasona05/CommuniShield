import { supabaseAdmin } from "../config/supabaseAdmin.js";

export const CREDIBILITY_POINTS = {
  report_rejected: -5,
  report_verified: 10,
  report_marked_fake: -30,
} as const;

export type CredibilityEventType = keyof typeof CREDIBILITY_POINTS;

type CredibilityResult<T> = { data: T; error: { message: string } | null };

async function isAdminOrSuperAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin" || data?.role === "super_admin";
}

export const credibilityService = {
  async ensureCredibility(userId: string): Promise<CredibilityResult<boolean>> {
    const { data } = await supabaseAdmin
      .from("user_credibility")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) return { data: true, error: null };

    const { error } = await supabaseAdmin
      .from("user_credibility")
      .insert({ user_id: userId });

    return { data: !error, error };
  },

  async getUserCredibility(
    userId: string
  ): Promise<
    CredibilityResult<{ score: number; level: number; level_label: string }>
  > {
    await this.ensureCredibility(userId);

    const { data, error } = await supabaseAdmin
      .from("user_credibility")
      .select("score, level, level_label")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return {
        data: { score: 60, level: 3, level_label: "Limited" },
        error,
      };
    }

    return {
      data: {
        score: Number(data.score),
        level: Number(data.level),
        level_label: data.level_label,
      },
      error: null,
    };
  },

  async addPoints(
    userId: string,
    eventType: CredibilityEventType,
    reason = "",
    reportId: string | null = null
  ): Promise<CredibilityResult<number>> {
    // Skip credibility scoring for admin/super_admin - they always have 100
    if (await isAdminOrSuperAdmin(userId)) {
      return { data: 100, error: null };
    }

    await this.ensureCredibility(userId);

    const points = CREDIBILITY_POINTS[eventType];

    const { data: current } = await supabaseAdmin
      .from("user_credibility")
      .select("score")
      .eq("user_id", userId)
      .maybeSingle();

    const base = Number(current?.score ?? 60);

    // If already at 100, don't add positive points
    if (base >= 100 && points > 0) {
      return { data: 100, error: null };
    }

    const next = Math.min(100, Math.max(0, base + points));
    const applied = next - base;

    if (applied !== 0) {
      const { error: eventError } = await supabaseAdmin
        .from("credibility_events")
        .insert({
          user_id: userId,
          event_type: eventType,
          points: applied,
          reason,
          report_id: reportId,
        });

      if (!eventError) {
        await supabaseAdmin
          .from("user_credibility")
          .update({ score: next })
          .eq("user_id", userId);
      }

      return { data: next, error: eventError };
    }

    return { data: next, error: null };
  },
};