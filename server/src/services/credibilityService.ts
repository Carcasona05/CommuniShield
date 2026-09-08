import { supabaseAdmin } from "../config/supabaseAdmin.js";

export const CREDIBILITY_POINTS = {
  report_submitted: 5,
  report_rejected: -10,
} as const;

export type CredibilityEventType = keyof typeof CREDIBILITY_POINTS;

type CredibilityResult<T> = { data: T; error: { message: string } | null };

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
    await this.ensureCredibility(userId);

    const points = CREDIBILITY_POINTS[eventType];

    const { data: current } = await supabaseAdmin
      .from("user_credibility")
      .select("score")
      .eq("user_id", userId)
      .maybeSingle();

    const base = Number(current?.score ?? 60);
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