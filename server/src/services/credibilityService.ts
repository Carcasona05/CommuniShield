import { supabaseAdmin } from "../config/supabaseAdmin.js";

export const CREDIBILITY_POINTS = {
  report_submitted: 0,
  report_verified: 15,
  report_rejected: -10,
  report_marked_fake: -30,
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

    // Normalize elapsed suspensions before returning the profile's score.
    const access = await supabaseAdmin.rpc("credibility_access", { p_user: userId });
    if (access.error) return { data: { score: 60, level: 3, level_label: "Limited" }, error: access.error };
    if (access.data?.policyVersion !== "timed-v1") return { data: { score: 60, level: 3, level_label: "Limited" }, error: { message: "Timed-suspension migration is required." } };

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
    _userId: string,
    eventType: CredibilityEventType,
    _reason = "",
    _reportId: string | null = null
  ): Promise<CredibilityResult<number>> {
    // Retained for old callers. Never allow non-transactional duplicate scoring.
    return eventType === "report_submitted" ? { data: 0, error: null }
      : { data: 0, error: { message: "Review scoring must be applied through the report review transaction." } };
  },
};
