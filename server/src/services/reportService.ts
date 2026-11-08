import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { cleanCredibilityReview } from "../utils/credibilityReview.js";
import { sentimentCoverage } from "./sentimentCoverage.js";
import { reverseGeocode } from "../utils/geocode.js";
import { deriveBarangay, hasReportCoordinates } from "../utils/argaoLocation.js";
import { encodeFeedCursor, type FeedCursor } from "../utils/feedCursor.js";
import {
  getRecommendedActions,
  ruleBasedActions,
  type ForecastActionFacts,
} from "./forecastActionsService.js";

type ReportInput = {
  location?: string;
  latitude?: string | number;
  longitude?: string | number;
  details?: string;
  poster_name?: string;
  display_name_type?: "Fullname" | "Username";
  incident_category?: string;
  incident_type?: string;
  photos?: string[];
  status?: string;
  is_verified?: boolean;
  role?: "user" | "admin" | "super_admin";
};

type SentimentRow = {
  subject_id: string;
  label: string;
  confidence: number | string | null;
  language: string;
  provider: string;
  model: string;
  status: string;
  error_code: string;
  analyzed_at: string | null;
};

const asTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

// PostgREST encodes .in() values in the URL. Hundreds of UUIDs can exceed
// proxy/header limits, so dashboard relation reads must use bounded batches.
async function loadDashboardRelations<T>(
  ids: string[],
  load: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: null } | { data: null; error: { message: string } }> {
  const rows: T[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const { data, error } = await load(uniqueIds.slice(offset, offset + 100));
    if (error) return { data: null, error };
    rows.push(...(data || []));
  }
  return { data: rows, error: null };
}

// PostgREST caps rows per response independently of the URL-size limit.
// Analytics must aggregate every page, including busy comment threads.
async function loadAnalyticsPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: null } | { data: null; error: { message: string } }> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

const VALID_STATUSES = [
  "Pending Review",
  "Under Verification",
  "Resolved",
  "Rejected",
  "Archived",
  "Marked Fake",
];

function categoryNameOf(rel: unknown): string {
  if (!rel) return "";
  if (Array.isArray(rel)) {
    const first = rel[0] as { name?: string } | undefined;
    return first?.name ?? "";
  }
  return (rel as { name?: string }).name ?? "";
}

const sentimentFields = (analysis: SentimentRow | undefined) => {
  const succeeded = analysis?.status === "succeeded";
  return {
    sentiment: succeeded ? (analysis?.label ?? null) : null,
    sentiment_confidence: succeeded ? Number(analysis?.confidence ?? 0) : 0,
    sentiment_language: analysis?.language ?? "unknown",
    sentiment_provider: analysis?.provider ?? "none",
    sentiment_model: analysis?.model ?? "none",
    sentiment_status: analysis?.status ?? "unavailable",
    sentiment_error: analysis?.error_code ?? "",
    sentiment_analyzed_at: analysis?.analyzed_at ?? null,
  };
};

async function resolveIncidentType(
  categoryName: string,
  typeName: string
): Promise<{ id: string | null; error: string | null }> {
  let { data: category } = await supabaseAdmin
    .from("incident_categories")
    .select("id")
    .eq("name", categoryName)
    .maybeSingle();

  if (!category) {
    const { data: inserted, error } = await supabaseAdmin
      .from("incident_categories")
      .insert({ name: categoryName })
      .select("id")
      .maybeSingle();

    if (error) return { id: null, error: error.message };
    if (!inserted) return { id: null, error: "Failed to create category" };
    category = inserted;
  }

  const { data: typeData, error: typeError } = await supabaseAdmin
    .from("incident_types")
    .select("id")
    .eq("category_id", category.id)
    .eq("name", typeName)
    .maybeSingle();

  if (typeError) return { id: null, error: typeError.message };
  if (typeData) return { id: typeData.id, error: null };

  const { data: insertedType, error: insertTypeError } = await supabaseAdmin
    .from("incident_types")
    .insert({ category_id: category.id, name: typeName })
    .select("id")
    .maybeSingle();

  if (insertTypeError) return { id: null, error: insertTypeError.message };
  if (!insertedType) return { id: null, error: "Failed to create incident type" };

  return { id: insertedType.id, error: null };
}

export const reportService = {
  async createReport(userId: string, input: ReportInput) {
    const category = asTrimmedString(input.incident_category);
    const type = asTrimmedString(input.incident_type);

    if (!category || !type) {
      return { error: "Incident category and type are required" };
    }

    const { id: incidentTypeId, error: resolveError } = await resolveIncidentType(
      category,
      type
    );

    if (resolveError) return { error: resolveError };

    const status = VALID_STATUSES.includes(input.status || "")
      ? input.status!
      : "Pending Review";
    const latitude = hasReportCoordinates(input) ? Number(input.latitude) : null;
    const longitude = hasReportCoordinates(input) ? Number(input.longitude) : null;
    // The client already resolves the address. Preserve its street details;
    // use bundled polygons as an instant fallback, never a second network
    // reverse-geocode request on the submission path.
    const barangay = deriveBarangay(input.location || "", input);
    const location = asTrimmedString(input.location) || (barangay ? `${barangay}, Argao, Cebu` : "Location not specified");

    const { data: report, error } = await supabaseAdmin
      .from("reports")
      .insert({
        user_id: userId,
        incident_type_id: incidentTypeId,
        location,
        latitude,
        longitude,
        poster_name: input.poster_name ?? "",
        display_name_type: input.display_name_type ?? "Fullname",
        details: asTrimmedString(input.details),
        status,
        is_verified: input.is_verified ?? false,
        role: input.role ?? "user",
      })
      .select("id, location")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!report) return { error: "Failed to create report" };

    const images = Array.isArray(input.photos)
      ? input.photos.map((url, index) => ({
          report_id: report.id,
          image_url: url,
          position: index,
        }))
      : [];

    if (images.length > 0) {
      const { error: imageError } = await supabaseAdmin
        .from("report_images")
        .insert(images);
      if (imageError) return { error: imageError.message };
    }

    return {
      data: {
        id: report.id,
        location: report.location ?? location,
      },
    };
  },

  async listFeedPage(viewerId: string, filters: { userId?: string; from?: string; to?: string; status?: string; source?: string; cursor?: FeedCursor | null } = {}) {
    const { data: page, error } = await supabaseAdmin.rpc("feed_page", {
      p_owner: filters.userId ?? null, p_from: filters.from ?? null, p_to: filters.to ?? null,
      p_status: filters.status ?? null, p_source: filters.source ?? "All",
      p_before_time: filters.cursor?.created_at ?? null, p_before_id: filters.cursor?.id ?? null,
      p_before_source: filters.cursor?.source ?? "User",
    });
    if (error) return { error: error.message };
    const keys = (page.items || []).slice(0, 10) as Required<FeedCursor>[];
    const reportIds = keys.filter(row => row.source === "User").map(row => row.id);
    const adminIds = keys.filter(row => row.source === "Admin").map(row => row.id);
    const [reports, posts] = await Promise.all([
      reportIds.length ? this.listReports(viewerId, { ids: reportIds, ...(filters.userId ? { userId: filters.userId } : {}) }) : { data: [], error: null },
      adminIds.length ? this.listAdminPosts({ ids: adminIds }) : { data: [], error: null },
    ]);
    if (reports.error || posts.error) return { error: reports.error || posts.error };
    return { data: {
      reports: reports.data, posts: posts.data, order: keys.map(row => `${row.source}:${row.id}`), total: Number(page.total), statusCounts: page.statusCounts,
      hasMore: page.items.length > 10,
      nextCursor: page.items.length > 10 ? encodeFeedCursor(keys[keys.length - 1]!) : null,
    }, error: null };
  },

  async listReports(viewerId?: string, filters: { userId?: string; from?: string; to?: string; ids?: string[] } = {}) {
    // Archived reports only live in the Logs archive view, never in feeds.
    let reportsQuery = supabaseAdmin
      .from("reports")
      .select(
        "id, user_id, location, latitude, longitude, details, poster_name, display_name_type, status, is_verified, created_at, incident_type_id, role"
      )
      .neq("status", "Archived");
    if (filters.userId) reportsQuery = reportsQuery.eq("user_id", filters.userId);
    if (filters.from) reportsQuery = reportsQuery.gte("created_at", filters.from);
    if (filters.to) reportsQuery = reportsQuery.lte("created_at", filters.to);
    if (filters.ids) reportsQuery = reportsQuery.in("id", filters.ids);
    const [{ data: reports, error: reportError }, { data: types, error: typesError }] = await Promise.all([
      reportsQuery.order("created_at", { ascending: false }),
      supabaseAdmin.from("incident_types").select("id, name, incident_categories(id, name)"),
    ]);

    if (reportError) return { data: null, error: reportError.message };
    if (typesError) return { data: null, error: typesError.message };

    const typeMap = new Map<string, { type: string; category: string }>();
    (types || []).forEach(row => typeMap.set(row.id, { type: row.name, category: categoryNameOf(row.incident_categories) }));

    const reportIds = (reports || []).map((r) => r.id);

    const [analysisResult, sentimentResult, imageResult, countsResult] = await Promise.all([
      loadDashboardRelations(reportIds, batch => supabaseAdmin
          .from("report_credibility_analysis")
          .select("report_id, ai_score, severity, credibility_review")
          .in("report_id", batch)),
      loadDashboardRelations(reportIds, batch => supabaseAdmin.from("sentiment_analysis")
        .select("subject_id, label, confidence, language, provider, model, status, error_code, analyzed_at")
        .eq("subject_type", "report").in("subject_id", batch)),
      loadDashboardRelations(reportIds, batch => supabaseAdmin.from("report_images")
        .select("report_id, image_url").in("report_id", batch).order("position", { ascending: true })),
      reportIds.length ? supabaseAdmin.rpc("report_engagement_counts", { p_ids: reportIds, p_viewer: viewerId ?? null }) : Promise.resolve({ data: [], error: null }),
    ]);
    const { data: analyses, error: analysisError } = analysisResult;

    if (analysisError) return { data: null, error: analysisError.message };

    const analysisMap = new Map<
      string,
      {
        ai_score: number | null;
        severity: string;
        credibility_review: string;
      }
    >();
    (analyses || []).forEach(
      (a: {
        report_id: string;
        ai_score: number | null;
        severity: string | null;
        credibility_review: string | null;
      }) => {
        analysisMap.set(a.report_id, {
          ai_score: a.ai_score ?? null,
          severity: a.severity ?? "Medium",
        credibility_review: cleanCredibilityReview(a.credibility_review),
        });
      }
    );

    const { data: sentimentRows, error: sentimentError } = sentimentResult;
    if (sentimentError) return { data: null, error: sentimentError.message };
    const sentimentMap = new Map<string, SentimentRow>();
    (sentimentRows || []).forEach((row: SentimentRow) => {
      sentimentMap.set(row.subject_id, row);
    });

    const { data: images, error: imageError } = imageResult;

    if (imageError) return { data: null, error: imageError.message };

    const imagesByReport = new Map<string, string[]>();
    (images || []).forEach((img: { report_id: string; image_url: string }) => {
      const list = imagesByReport.get(img.report_id) || [];
      list.push(img.image_url);
      imagesByReport.set(img.report_id, list);
    });

    const engagement = new Map<string, { likes: number; comments: number; is_liked: boolean }>();
    if (reportIds.length > 0) {
      const { data: counts, error: countError } = countsResult;
      if (countError) return { data: null, error: countError.message };
      (counts || []).forEach((row: { id: string; likes: number; comments: number; is_liked: boolean }) => {
        engagement.set(row.id, { likes: Number(row.likes), comments: Number(row.comments), is_liked: row.is_liked });
      });
    }

    const enriched = (reports || []).map((r) => {
      const typeInfo = typeMap.get(r.incident_type_id) || {
        type: "",
        category: "",
      };
      
      const analysis = analysisMap.get(r.id) ?? {
        ai_score: null,
        severity: "Medium",
        credibility_review: "",
      };
      const sentiment = sentimentMap.get(r.id);

      return {
        id: r.id,
        user_id: r.user_id,
        location: r.location ?? "",
        details: r.details ?? "",
        poster_name: r.poster_name ?? "",
        status: r.status ?? "Pending Review",
        is_verified: r.is_verified ?? false,
        created_at: r.created_at,
        incident_category: typeInfo.category,
        incident_type: typeInfo.type,
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        images: imagesByReport.get(r.id) || [],
        likes: engagement.get(r.id)?.likes || 0,
        comments: engagement.get(r.id)?.comments || 0,
        is_liked: engagement.get(r.id)?.is_liked || false,
        ai_score: analysis.ai_score ?? null,
        severity: analysis.severity ?? "Medium",
        ...sentimentFields(sentiment),
        credibility_review: cleanCredibilityReview(analysis.credibility_review),
      };
    });

    const final = enriched.map((r) => ({
      ...r,
      poster_name: r.poster_name || "Anonymous User",
    }));

    return { data: final, error: null };
  },

  async listMyReports(userId: string) {
    return this.listReports(userId, { userId });
  },

  async getReportById(viewerId: string | undefined, reportId: string) {
    const all = await this.listReports(viewerId, { ids: [reportId] });
    if (all.error) return all;

    const report = (all.data || []).find((r) => r.id === reportId) ?? null;
    return { data: report, error: null };
  },

  async updateReport(
    userId: string,
    reportId: string,
    input: ReportInput,
    options: { adminScope?: boolean } = {}
  ) {
    let ownerQuery = supabaseAdmin
      .from("reports")
      .select("id")
      .eq("id", reportId);
    if (!options.adminScope) ownerQuery = ownerQuery.eq("user_id", userId);
    const { data: own } = await ownerQuery.maybeSingle();

    if (!own) return { error: "Report not found" };

    const updates: Record<string, unknown> = {};
    if (typeof input.details === "string") updates.details = input.details.trim();
    if (typeof input.location === "string") updates.location = input.location;
    if (typeof input.poster_name === "string") updates.poster_name = input.poster_name;

    if (input.latitude !== undefined || input.longitude !== undefined) {
      if (!hasReportCoordinates(input)) return { error: "Valid latitude and longitude are required together" };
      updates.latitude = Number(input.latitude);
      updates.longitude = Number(input.longitude);
    }

    const coordPattern = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/;
    const latNum = input.latitude ? Number(input.latitude) : null;
    const lngNum = input.longitude ? Number(input.longitude) : null;
    if (
      latNum &&
      lngNum &&
      (updates.location === undefined ||
        (typeof updates.location === "string" && coordPattern.test(updates.location)))
    ) {
      const resolved = await reverseGeocode(latNum, lngNum);
      if (resolved) updates.location = resolved;
    }

    const category = asTrimmedString(input.incident_category);
    const type = asTrimmedString(input.incident_type);

    if (category && type) {
      const { id: incidentTypeId, error: resolveError } = await resolveIncidentType(
        category,
        type
      );
      if (resolveError) return { error: resolveError };
      updates.incident_type_id = incidentTypeId;
    }

    let updateQuery = supabaseAdmin
      .from("reports")
      .update(updates)
      .eq("id", reportId);
    if (!options.adminScope) updateQuery = updateQuery.eq("user_id", userId);
    const { error: updateError } = await updateQuery;

    if (updateError) return { error: updateError.message };

    if (Array.isArray(input.photos)) {
      const { error: delError } = await supabaseAdmin
        .from("report_images")
        .delete()
        .eq("report_id", reportId);
      if (delError) return { error: delError.message };

      if (input.photos.length > 0) {
        const images = input.photos.map((url, index) => ({
          report_id: reportId,
          image_url: url,
          position: index,
        }));
        const { error: imgError } = await supabaseAdmin
          .from("report_images")
          .insert(images);
        if (imgError) return { error: imgError.message };
      }
    }

    return { data: reportId };
  },

  async deleteReport(
    userId: string,
    reportId: string,
    options: { adminScope?: boolean } = {}
  ) {
    let ownerQuery = supabaseAdmin
      .from("reports")
      .select("id")
      .eq("id", reportId);
    if (!options.adminScope) ownerQuery = ownerQuery.eq("user_id", userId);
    const { data: own, error: checkError } = await ownerQuery.maybeSingle();

    if (checkError) return { error: checkError.message };
    if (!own) return { error: "Report not found" };

    let deleteQuery = supabaseAdmin.from("reports").delete().eq("id", reportId);
    if (!options.adminScope) deleteQuery = deleteQuery.eq("user_id", userId);
    const { error } = await deleteQuery;

    if (error) return { error: error.message };

    return { data: reportId };
  },

  async addComment(userId: string, reportId: string, content: string) {
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) return { error: "Comment is required" };
    if (text.length > 2000) return { error: "Comment must be 2000 characters or fewer" };

    const { data: report, error: reportError } = await supabaseAdmin
      .from("reports")
      .select("id")
      .eq("id", reportId)
      .maybeSingle();
    if (reportError) return { error: reportError.message };
    if (!report) return { error: "Report not found" };

    const { data, error } = await supabaseAdmin
      .from("report_comments")
      .insert({
        report_id: reportId,
        user_id: userId,
        content: text,
      })
      .select("id, content, created_at")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Failed to create comment" };
    const [profileResult, countResult] = await Promise.allSettled([
      supabaseAdmin.from("profiles").select("fullname, user_name").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("report_comments").select("id", { count: "exact", head: true }).eq("report_id", reportId),
    ]);
    const profile = profileResult.status === "fulfilled" ? profileResult.value.data : null;
    const count = countResult.status === "fulfilled" ? countResult.value : null;
    // Persistence already succeeded: a failed optional count must not turn a
    // saved comment into a misleading error (which could cause a duplicate retry).
    return { data: data.id, total: count?.error ? null : count?.count ?? null, comment: { id: data.id, text: data.content, datePosted: data.created_at,
      user: profile?.fullname || profile?.user_name || "User", sentiment: null, sentiment_status: "pending" } };
  },

  async listComments(reportId: string, cursor: FeedCursor | null = null) {
    let query = supabaseAdmin
      .from("report_comments")
      .select("id, user_id, content, created_at")
      .eq("report_id", reportId);
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    const [{ data: rows, error }, count] = await Promise.all([
      query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(11),
      supabaseAdmin.from("report_comments").select("id", { count: "exact", head: true }).eq("report_id", reportId),
    ]);

    if (error) return { data: null, error: error.message };
    if (count.error) return { data: null, error: count.error.message };
    const data = (rows || []).slice(0, 10);
    const hasMore = (rows || []).length > 10;
    const oldest = data[data.length - 1];
    const nextCursor = hasMore && oldest ? encodeFeedCursor({ id: oldest.id, created_at: oldest.created_at }) : null;

    const commentIds = (data || []).map((comment) => comment.id);
    const userIds = [...new Set(data.map(c => c.user_id).filter(Boolean))];
    const [sentiments, names, jobs] = await Promise.all([
      commentIds.length ? supabaseAdmin.from("sentiment_analysis")
        .select("subject_id, label, confidence, language, provider, model, status, error_code, analyzed_at")
        .eq("subject_type", "comment").in("subject_id", commentIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? supabaseAdmin.from("profiles").select("id, fullname, user_name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
      commentIds.length ? supabaseAdmin.from("comment_sentiment_jobs").select("comment_id").in("comment_id", commentIds).is("completed_at", null) : Promise.resolve({ data: [], error: null }),
    ]);
    if (sentiments.error) return { data: null, error: sentiments.error.message };
    if (jobs.error) return { data: null, error: jobs.error.message };
    const sentimentByComment = new Map<string, SentimentRow>();
    (sentiments.data || []).forEach((analysis: SentimentRow) => sentimentByComment.set(analysis.subject_id, analysis));
    const nameByUser = new Map<string, string>();
    (names.data || []).forEach(
        (p: { id: string; fullname: string | null; user_name: string | null }) =>
          nameByUser.set(p.id, p.fullname || p.user_name || "User")
      );

    const comments = (data || []).map((c) => {
      const analysis = sentimentByComment.get(c.id);
      return {
        id: c.id,
        user: nameByUser.get(c.user_id) || "User",
        text: c.content,
        datePosted: c.created_at,
        ...sentimentFields(analysis),
      };
    });

    const pendingIds = new Set((jobs.data || []).map(job => job.comment_id));
    comments.forEach(comment => {
      if (pendingIds.has(comment.id) && ["unavailable", "failed"].includes(comment.sentiment_status)) comment.sentiment_status = "pending";
    });
    return { data: comments.reverse(), total: count.count ?? 0, hasMore, nextCursor, error: null };
  },

  async commentStatuses(reportId: string, ids: string[]) {
    const { data: comments, error } = await supabaseAdmin.from("report_comments").select("id").eq("report_id", reportId).in("id", ids);
    if (error) return { error: error.message };
    const allowed = (comments || []).map(row => row.id);
    if (!allowed.length) return { data: [], error: null };
    const [{ data, error: analysisError }, jobs] = await Promise.all([
      supabaseAdmin.from("sentiment_analysis")
        .select("subject_id, label, confidence, language, provider, model, status, error_code, analyzed_at")
        .eq("subject_type", "comment").in("subject_id", allowed),
      supabaseAdmin.from("comment_sentiment_jobs").select("comment_id").in("comment_id", allowed).is("completed_at", null),
    ]);
    if (analysisError) return { error: analysisError.message };
    if (jobs.error) return { error: jobs.error.message };
    const analyses = new Map<string, SentimentRow>((data || []).map((row: SentimentRow) => [row.subject_id, row]));
    const pending = new Set((jobs.data || []).map(row => row.comment_id));
    return { data: allowed.map(id => ({ id, ...sentimentFields(analyses.get(id)),
      ...(pending.has(id) ? { sentiment_status: "pending" } : {}) })), error: null };
  },

  async toggleLike(userId: string, reportId: string) {
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("report_likes")
      .select("report_id")
      .eq("report_id", reportId)
      .eq("user_id", userId)
      .maybeSingle();

    if (checkError) return { error: checkError.message, liked: false };

    if (existing) {
      const { error } = await supabaseAdmin
        .from("report_likes")
        .delete()
        .eq("report_id", reportId)
        .eq("user_id", userId);
      if (error) return { error: error.message, liked: false };
      const countResult = await this.countLikes(reportId);
      return {
        data: { liked: false, likes: countResult.error ? undefined : countResult.data },
        error: null,
      };
    }

    const { error } = await supabaseAdmin.from("report_likes").insert({
      report_id: reportId,
      user_id: userId,
    });
    if (error) return { error: error.message, liked: false };
    const countResult = await this.countLikes(reportId);
    return {
      data: { liked: true, likes: countResult.error ? undefined : countResult.data },
      error: null,
    };
  },

  async countLikes(reportId: string) {
    const { data, error } = await supabaseAdmin
      .from("report_likes")
      .select("report_id")
      .eq("report_id", reportId);

    if (error) return { data: 0, error: error.message };
    return { data: (data || []).length, error: null };
  },

  async listIncidentOptions() {
    const { data: categories, error: categoryError } = await supabaseAdmin
      .from("incident_categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (categoryError) return { data: null, error: categoryError.message };

    const categoryIds = (categories || []).map((c) => c.id);

    const { data: types, error: typeError } = categoryIds.length
      ? await supabaseAdmin
          .from("incident_types")
          .select("category_id, name")
          .in("category_id", categoryIds)
          .order("name", { ascending: true })
      : { data: [], error: null };

    if (typeError) return { data: null, error: typeError.message };

    const typesByCategory = new Map<string, string[]>();
    (types || []).forEach((t: { category_id: string; name: string }) => {
      const list = typesByCategory.get(t.category_id) || [];
      list.push(t.name);
      typesByCategory.set(t.category_id, list);
    });

    const options = (categories || []).map((c) => ({
      category: c.name,
      types: typesByCategory.get(c.id) || [],
    }));

    return { data: options, error: null };
  },

  async listAdminPosts(filters: { from?: string; to?: string; ids?: string[] } = {}) {
    let query = supabaseAdmin
      .from("admin_announcement")
      .select("id, admin_id, type, location, details, pic_url, created_at");
    if (filters.from) query = query.gte("created_at", filters.from);
    if (filters.to) query = query.lte("created_at", filters.to);
    if (filters.ids) query = query.in("id", filters.ids);
    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) return { data: null, error: error.message };

    const enriched = (data || []).map((p) => ({
      id: p.id,
      adminName: "CommuniShield Admin",
      type: p.type,
      location: p.location ?? "",
      details: p.details ?? "",
      datePosted: p.created_at,
      pic: p.pic_url ?? null,
    }));

    return { data: enriched, error: null };
  },

  async createAnnouncement(
    adminId: string,
    input: {
      type?: string;
      title?: string;
      location?: string;
      details?: string;
      pic_url?: string;
    }
  ) {
    const type = (input.type || "").trim();
    const title = (input.title || "").trim();
    const details = (input.details || "").trim();

    if (!title || !type || !details) {
      return { error: "Announcement title, type and details are required" };
    }

    const { data: announcement, error } = await supabaseAdmin
      .from("admin_announcement")
      .insert({
        admin_id: adminId,
        type,
        title,
        location: input.location ?? "",
        details,
        pic_url: input.pic_url ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!announcement) return { error: "Failed to create announcement" };

    return { data: announcement.id };
  },

  async listAdminAnnouncements(filters: { from?: string; to?: string } = {}) {
    let announcementsQuery = supabaseAdmin
      .from("admin_announcement")
      .select("id, type, title, location, details, pic_url, admin_id, created_at");
    if (filters.from) {
      announcementsQuery = announcementsQuery.gte("created_at", filters.from);
    }
    if (filters.to) {
      announcementsQuery = announcementsQuery.lte("created_at", filters.to);
    }

    const { data, error } = await announcementsQuery.order("created_at", {
      ascending: false,
    });
    if (error) return { data: null, error: error.message };

    return {
      data: (data || []).map((announcement) => ({
        id: announcement.id,
        type: announcement.type,
        title: announcement.title,
        location: announcement.location ?? "",
        details: announcement.details ?? "",
        pic_url: announcement.pic_url ?? null,
        adminId: announcement.admin_id,
        created_at: announcement.created_at,
      })),
      error: null,
    };
  },

  async updateAnnouncement(
    announcementId: string,
    input: {
      type?: string;
      title?: string;
      location?: string;
      details?: string;
      pic_url?: string | null;
    }
  ) {
    const type = (input.type || "").trim();
    const title = (input.title || "").trim();
    const details = (input.details || "").trim();

    if (!title || !type || !details) {
      return { error: "Announcement title, type and details are required" };
    }

    const updates: Record<string, unknown> = {
      type,
      title,
      location: input.location ?? "",
      details,
    };
    if (input.pic_url !== undefined) updates.pic_url = input.pic_url;

    const { data, error } = await supabaseAdmin
      .from("admin_announcement")
      .update(updates)
      .eq("id", announcementId)
      .select("id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Announcement not found" };

    return { data: data.id };
  },

  async deleteAnnouncement(announcementId: string) {
    const { data, error } = await supabaseAdmin
      .from("admin_announcement")
      .delete()
      .eq("id", announcementId)
      .select("id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Announcement not found" };

    return { data: data.id };
  },

  async listAuditLogs(
    actorRole?: string,
    filters: { from?: string; to?: string } = {}
  ) {
    let auditQuery = supabaseAdmin
      .from("audit_logs")
      .select(
        "id, actor_id, actor_name, action_type, title, details, report_id, old_value, new_value, created_at"
      );
    if (filters.from) auditQuery = auditQuery.gte("created_at", filters.from);
    if (filters.to) auditQuery = auditQuery.lte("created_at", filters.to);

    const { data, error } = await auditQuery
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return { data: null, error: error.message };

    let filteredData = data || [];
    const actorIds = [
      ...new Set(filteredData.map((log) => log.actor_id).filter(Boolean)),
    ];
    const { data: profiles, error: profileError } = actorIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, role")
          .in("id", actorIds)
      : { data: [], error: null };
    if (profileError) return { data: null, error: profileError.message };

    const rolesByActor = new Map(
      (profiles || []).map((profile) => [profile.id, profile.role])
    );

    if (actorRole === "admin" || actorRole === "super_admin") {
      filteredData = filteredData.filter(
        (log) => rolesByActor.get(log.actor_id) === actorRole
      );
    }

    const logs = filteredData.map((l) => ({
      id: l.id,
      actionType: l.action_type,
      title: l.title ?? "",
      actor: l.actor_name ?? "System",
      actorRole: rolesByActor.get(l.actor_id) ?? "system",
      reportId: l.report_id ?? "",
      details: l.details ?? "",
      oldStatus: l.old_value ?? "",
      newStatus: l.new_value ?? "",
      dateTime: l.created_at,
    }));

    return { data: logs, error: null };
  },

  async getAdminDashboard(filters: {
    status?: string;
    source?: string;
    from?: string;
    to?: string;
  } = {}) {
    const { data: types, error: typesError } = await supabaseAdmin
      .from("incident_types")
      .select("id, name, incident_categories(id, name)");

    if (typesError) return { data: null, error: typesError.message };

    const typeMap = new Map<string, { type: string; category: string }>();
    (types || []).forEach((row) => {
      const t = row as unknown as {
        id: string;
        name: string;
        incident_categories: { name: string }[] | null;
      };
      typeMap.set(t.id, {
        type: t.name,
        category: categoryNameOf(t.incident_categories),
      });
    });

    let reportQuery = supabaseAdmin
      .from("reports")
      .select(
        "id, user_id, location, latitude, longitude, details, poster_name, status, is_verified, created_at, incident_type_id, role"
      );
    if (filters.status === "Archived") {
      // Explicit archived view used by the Logs archive tab.
      reportQuery = reportQuery.eq("status", "Archived");
    } else {
      reportQuery = reportQuery.neq("status", "Archived");
      if (filters.status) reportQuery = reportQuery.eq("status", filters.status);
    }
    if (filters.source?.toLowerCase() === "admin") {
      reportQuery = reportQuery.in("role", ["admin", "super_admin"]);
    }
    if (filters.from) reportQuery = reportQuery.gte("created_at", filters.from);
    if (filters.to) reportQuery = reportQuery.lte("created_at", filters.to);

    const { data: reports, error: reportError } = await reportQuery.order(
      "created_at",
      { ascending: false }
    );

    if (reportError) return { data: null, error: reportError.message };

    const reportIds = (reports || []).map((r) => r.id);

    const reporterIds = [
      ...new Set(
        (reports || [])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const reporterNameByUser = new Map<string, string>();
    // These lookups depend only on the report snapshot, not on each other.
    // Fetch together so hotspot/dashboard loads do not pay five network waits.
    const [reporterResult, analysisResult, sentimentResult, commentsResult, imagesResult] = await Promise.all([
      loadDashboardRelations(reporterIds, (batch) => supabaseAdmin
        .from("profiles").select("id, fullname, user_name").in("id", batch)),
      loadDashboardRelations(reportIds, (batch) => supabaseAdmin
        .from("report_credibility_analysis").select("report_id, ai_score, severity, credibility_review").in("report_id", batch)),
      loadDashboardRelations(reportIds, (batch) => supabaseAdmin
        .from("sentiment_analysis")
        .select("subject_id, label, confidence, language, provider, model, status, error_code, analyzed_at")
        .eq("subject_type", "report").in("subject_id", batch)),
      loadDashboardRelations(reportIds, (batch) => supabaseAdmin
        .from("report_comments").select("id, report_id, user_id, content, created_at")
        .in("report_id", batch).order("created_at", { ascending: true })),
      loadDashboardRelations(reportIds, (batch) => supabaseAdmin
        .from("report_images").select("report_id, image_url")
        .in("report_id", batch).order("position", { ascending: true })),
    ]);
    if (reporterIds.length > 0) {
      const { data: reporterProfiles, error: profilesError } = reporterResult;
      if (profilesError) return { data: null, error: profilesError.message };
      (reporterProfiles || []).forEach(
        (p: { id: string; fullname: string | null; user_name: string | null }) => {
          reporterNameByUser.set(p.id, p.fullname || p.user_name || "");
        }
      );
    }

    const { data: analyses, error: analysisError } = analysisResult;

    if (analysisError) return { data: null, error: analysisError.message };

    const { data: sentimentRows, error: sentimentError } = sentimentResult;
    if (sentimentError) return { data: null, error: sentimentError.message };
    const sentimentMap = new Map<string, SentimentRow>();
    (sentimentRows || []).forEach((row: SentimentRow) => {
      sentimentMap.set(row.subject_id, row);
    });

    const analysisMap = new Map<
      string,
      {
        ai_score: number | null;
        severity: string;
        credibility_review: string;
      }
    >();
    (analyses || []).forEach(
      (a: {
        report_id: string;
        ai_score: number | null;
        severity: string | null;
        credibility_review: string | null;
      }) => {
        analysisMap.set(a.report_id, {
          ai_score: a.ai_score ?? null,
          severity: a.severity ?? "Medium",
        credibility_review: cleanCredibilityReview(a.credibility_review),
        });
      }
    );

    const { data: commentRows, error: commentsError } = commentsResult;

    if (commentsError) return { data: null, error: commentsError.message };

    const dashboardUserIds = [
      ...new Set(
        (commentRows || [])
          .map((c: { user_id: string | null }) => c.user_id)
          .filter((id: string | null): id is string => Boolean(id))
      ),
    ];
    const dashboardNameByUser = new Map<string, string>();
    if (dashboardUserIds.length > 0) {
      const { data: dashboardProfiles, error: profilesError } = await loadDashboardRelations(dashboardUserIds, (batch) => supabaseAdmin
        .from("profiles")
        .select("id, fullname, user_name")
        .in("id", batch));
      if (profilesError) return { data: null, error: profilesError.message };
      (dashboardProfiles || []).forEach(
        (profile: { id: string; fullname: string | null; user_name: string | null }) => {
          dashboardNameByUser.set(
            profile.id,
            profile.fullname || profile.user_name || "User"
          );
        }
      );
    }

    const dashboardCommentIds = (commentRows || []).map((c) => c.id);
    const dashboardCommentSentiment = new Map<string, SentimentRow>();
    if (dashboardCommentIds.length > 0) {
      const { data: commentSentimentRows, error: commentSentimentError } =
        await loadDashboardRelations(dashboardCommentIds, (batch) => supabaseAdmin
          .from("sentiment_analysis")
          .select("subject_id, label, confidence, language, provider, model, status, error_code, analyzed_at")
          .eq("subject_type", "comment")
          .in("subject_id", batch));
      if (commentSentimentError) {
        return { data: null, error: commentSentimentError.message };
      }
      (commentSentimentRows || []).forEach((row: SentimentRow) => {
        dashboardCommentSentiment.set(row.subject_id, row);
      });
    }

    const commentsByReport = new Map<string, Array<Record<string, unknown>>>();
    (commentRows || []).forEach(
      (c: {
        id: string;
        report_id: string;
        user_id: string | null;
        content: string;
        created_at: string;
      }) => {
        const list = commentsByReport.get(c.report_id) || [];
        list.push({
          id: c.id,
          user: c.user_id ? (dashboardNameByUser.get(c.user_id) || "User") : "CommuniShield User",
          text: c.content,
          datePosted: c.created_at,
          ...sentimentFields(dashboardCommentSentiment.get(c.id)),
        });
        commentsByReport.set(c.report_id, list);
      }
    );

    const { data: images, error: imageError } = imagesResult;

    if (imageError) return { data: null, error: imageError.message };

    const imagesByReport = new Map<string, string[]>();
    (images || []).forEach((img: { report_id: string; image_url: string }) => {
      const list = imagesByReport.get(img.report_id) || [];
      list.push(img.image_url);
      imagesByReport.set(img.report_id, list);
    });

    const list = (reports || []).map((r) => {
      const info = typeMap.get(r.incident_type_id) || {
        type: "Incident",
        category: "",
      };
      const analysis = analysisMap.get(r.id) ?? {
        ai_score: null,
        severity: "Medium",
        credibility_review: "",
      };
      return {
        id: r.id,
        location: r.location ?? "",
        barangay: deriveBarangay(r.location ?? "", r),
        details: r.details ?? "",
        poster_name: r.poster_name ?? "",
        reporter_name:
          (r.user_id ? reporterNameByUser.get(r.user_id) : "") ||
          r.poster_name ||
          "Anonymous User",
        status: r.status ?? "Pending Review",
        is_verified: r.is_verified ?? false,
        created_at: r.created_at,
        incident_category: info.category,
        incident_type: info.type,
        latitude: r.latitude,
        longitude: r.longitude,
        ai_score: analysis.ai_score ?? null,
        severity: analysis.severity ?? "Medium",
        ...sentimentFields(sentimentMap.get(r.id)),
        credibility_review: cleanCredibilityReview(analysis.credibility_review),
        comments: commentsByReport.get(r.id) || [],
        images: imagesByReport.get(r.id) || [],
        source: r.role === "admin" || r.role === "super_admin" ? "Admin" : "User",
      };
    });

    const pending = list.filter((r) => r.status === "Pending Review").length;
    const verified = list.filter(
      (r) => r.is_verified || r.status === "Resolved"
    ).length;
    const rejected = list.filter((r) => r.status === "Rejected").length;
    const hotspots = list.filter(
      (r) =>
        (r.severity === "High" || r.severity === "Critical") &&
        !["Rejected", "Archived"].includes(r.status)
    ).length;

    return {
      data: {
        summary: {
          total: list.length,
          pending,
          verified,
          rejected,
          hotspots,
        },
        reports: list,
      },
      error: null,
    };
  },

  async getAdminAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: types, error: typesError } = await supabaseAdmin
      .from("incident_types")
      .select("id, name, incident_categories(id, name)");

    if (typesError) return { data: null, error: typesError.message };

    const typeMap = new Map<string, { type: string; category: string }>();
    (types || []).forEach((row) => {
      const t = row as unknown as {
        id: string;
        name: string;
        incident_categories: { name: string }[] | null;
      };
      typeMap.set(t.id, {
        type: t.name,
        category: categoryNameOf(t.incident_categories),
      });
    });

    const { data: reports, error: reportError } = await loadAnalyticsPages((from, to) => supabaseAdmin
      .from("reports")
      .select(
        "id, location, latitude, longitude, poster_name, status, is_verified, created_at, incident_type_id"
      )
      .neq("status", "Archived")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to));

    if (reportError) return { data: null, error: reportError.message };

    const reportIds = (reports || []).map((r) => r.id);

    const { data: analyses, error: analysisError } = await loadDashboardRelations(reportIds, (batch) => supabaseAdmin
          .from("report_credibility_analysis")
          .select("report_id, ai_score, severity")
          .in("report_id", batch));

    if (analysisError) return { data: null, error: analysisError.message };

    const { data: sentimentRows, error: sentimentError } = await loadDashboardRelations(reportIds, (batch) => supabaseAdmin
          .from("sentiment_analysis")
          .select("subject_id, label, confidence, language, provider, model, status, error_code, analyzed_at")
          .eq("subject_type", "report")
          .in("subject_id", batch));
    if (sentimentError) return { data: null, error: sentimentError.message };
    const sentimentMap = new Map<string, SentimentRow>();
    (sentimentRows || []).forEach((row: SentimentRow) => {
      sentimentMap.set(row.subject_id, row);
    });

    const { data: commentRows, error: commentError } = await loadDashboardRelations(reportIds, (batch) =>
      loadAnalyticsPages((from, to) => supabaseAdmin
          .from("report_comments")
          .select("id, report_id, created_at")
          .in("report_id", batch)
          .order("id")
          .range(from, to)));
    if (commentError) return { data: null, error: commentError.message };
    const commentIds = (commentRows || []).map((c: { id: string }) => c.id);
    const commentSentimentMap = new Map<string, SentimentRow>();
    if (commentIds.length) {
      const { data: commentSentimentRows, error: commentSentimentError } =
        await loadDashboardRelations(commentIds, (batch) => supabaseAdmin
          .from("sentiment_analysis")
          .select("subject_id, label, confidence, language, provider, model, status, error_code, analyzed_at")
          .eq("subject_type", "comment")
          .in("subject_id", batch));
      if (commentSentimentError) {
        return { data: null, error: commentSentimentError.message };
      }
      (commentSentimentRows || []).forEach((row: SentimentRow) => {
        commentSentimentMap.set(row.subject_id, row);
      });
    }

    const analysisMap = new Map<
      string,
      { ai_score: number | null; severity: string }
    >();
    (analyses || []).forEach(
      (a: {
        report_id: string;
        ai_score: number | null;
        severity: string | null;
      }) => {
        analysisMap.set(a.report_id, {
          ai_score: a.ai_score ?? null,
          severity: a.severity ?? "Medium",
        });
      }
    );

    const list = (reports || []).map((r) => {
      const info = typeMap.get(r.incident_type_id) || {
        type: "Incident",
        category: "",
      };
      const analysis = analysisMap.get(r.id) ?? {
        ai_score: null,
        severity: "Medium",
      };
      return {
        id: r.id,
        location: r.location ?? "",
        poster_name: r.poster_name ?? "",
        status: r.status ?? "Pending Review",
        is_verified: r.is_verified ?? false,
        created_at: r.created_at,
        incident_category: info.category,
        incident_type: info.type,
        latitude: r.latitude,
        longitude: r.longitude,
        ai_score: analysis.ai_score ?? null,
        severity: analysis.severity ?? "Medium",
        ...sentimentFields(sentimentMap.get(r.id)),
      };
    });

    const SENTIMENT_POLARITY: Record<string, number> = {
      negative: 0.8,
      mixed: 0.5,
      unclear: 0.5,
      neutral: 0.5,
      positive: 0.2,
    };

    const active = list.filter(
      (r) => !["Rejected", "Archived"].includes(r.status)
    );

    const criticalHotspots = active.filter(
      (r) => r.severity === "High" || r.severity === "Critical"
    ).length;

    const successfulReportSentiments = list.filter(
      (r) => r.sentiment_status === "succeeded" && r.sentiment
    );
    const successfulCommentSentiments: Array<{ label: string; created_at: string }> = [];
    for (const c of commentRows || []) {
      const row = commentSentimentMap.get((c as { id: string }).id);
      if (row?.status === "succeeded" && row.label) {
        successfulCommentSentiments.push({
          label: row.label,
          created_at: (c as { created_at: string }).created_at,
        });
      }
    }
    const successfulLabels = [
      ...successfulReportSentiments.map((r) => String(r.sentiment)),
      ...successfulCommentSentiments.map((c) => c.label),
    ];
    const totalSubjects = list.length + (commentRows || []).length;
    const noSentimentCount = Math.max(0, totalSubjects - successfulLabels.length);
    const distribution = [
      ...["positive", "neutral", "negative", "mixed", "unclear"].map((label) => ({
        label,
        count: successfulLabels.filter((l) => l === label).length,
      })),
      { label: "none", count: noSentimentCount },
    ];
    const avgPolarity = successfulLabels.length
      ? successfulLabels.reduce(
          (sum, label) => sum + (SENTIMENT_POLARITY[label] ?? 0.5),
          0
        ) / successfulLabels.length
      : 0.5;
    const avgSentiment = successfulLabels.length
      ? (avgPolarity * 5).toFixed(1)
      : "—";
    const sentimentLabel = successfulLabels.length
      ? avgPolarity >= 0.6
        ? "negative"
        : avgPolarity >= 0.4
          ? "neutral"
          : "positive"
      : "unavailable";

    const nonRejected = list.filter((r) => r.status !== "Rejected");
    const verifiedCount = nonRejected.filter(
      (r) => r.is_verified || r.status === "Resolved"
    ).length;
    const credibilityRate = nonRejected.length
      ? Math.round((verifiedCount / nonRejected.length) * 100)
      : 0;

    const sentimentTrend = Array.from({ length: 24 }, (_, i) => {
      const start = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const reportBucket = successfulReportSentiments.filter((r) => {
        const t = new Date(r.created_at);
        return t >= start && t < end;
      });
      const commentBucket = successfulCommentSentiments.filter((c) => {
        const t = new Date(c.created_at);
        return t >= start && t < end;
      });
      const bucketLabels = [
        ...reportBucket.map((r) => String(r.sentiment)),
        ...commentBucket.map((c) => c.label),
      ];
      const allReportsInBucket = list.filter((r) => {
        const t = new Date(r.created_at);
        return t >= start && t < end;
      });
      const allCommentsInBucket = (commentRows || []).filter((c) => {
        const t = new Date((c as { created_at: string }).created_at);
        return t >= start && t < end;
      });
      const noSentiment = Math.max(
        0,
        allReportsInBucket.length + allCommentsInBucket.length - bucketLabels.length
      );
      const value = bucketLabels.length
        ? Math.round(
            (bucketLabels.reduce(
              (sum, label) => sum + (SENTIMENT_POLARITY[label] ?? 0.5),
              0
            ) /
              bucketLabels.length) *
              100
          )
        : 0;
      return {
        hour: start.getHours(),
        value,
        count: bucketLabels.length,
        noSentiment,
      };
    });

    const hourCounts = new Array(24).fill(0);
    active.forEach((r) => {
      const h = new Date(r.created_at).getHours();
      hourCounts[h] += 1;
    });

    let recent = 0;
    let prior = 0;
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now.getTime() - 14 * 24 * 60 * 60 * 1000;
    active.forEach((r) => {
      const t = new Date(r.created_at).getTime();
      if (t >= weekAgo) recent += 1;
      else if (t >= twoWeeksAgo) prior += 1;
    });
    const trendFactor =
      recent + prior ? (recent - prior) / Math.max(1, recent + prior) : 0;

    const dayMs = 24 * 60 * 60 * 1000;
    let earliest = now.getTime();
    active.forEach((r) => {
      const t = new Date(r.created_at).getTime();
      if (t < earliest) earliest = t;
    });
    const windowDays = active.length
      ? Math.min(30, Math.max(1, (now.getTime() - earliest) / dayMs))
      : 30;

    const forecast = Array.from({ length: 48 }, (_, i) => {
      const target = new Date(now.getTime() + i * 60 * 60 * 1000);
      const h = target.getHours();
      const lambda =
        (hourCounts[h] / windowDays) * (1 + trendFactor * ((i + 1) / 48));
      const probability = Math.min(
        100,
        Math.max(3, Math.round((1 - Math.exp(-lambda)) * 100))
      );
      return { hour: target.getTime(), probability };
    });

    const peak = forecast.reduce((best, f) =>
      f.probability > best.probability ? f : best
    );

    const zoneCandidates = active.filter(
      (r) => r.severity === "High" || r.severity === "Critical"
    );
    const normalizeLocation = (value: string) =>
      value.trim().toLowerCase().replace(/\s+/g, " ");
    const zoneCounts = new Map<string, { count: number; display: string }>();
    zoneCandidates.forEach((r) => {
      const raw = (r.location || "").trim();
      if (!raw) return;
      const key = normalizeLocation(raw);
      const entry = zoneCounts.get(key) || { count: 0, display: raw };
      entry.count += 1;
      zoneCounts.set(key, entry);
    });
    const rankedZones = [...zoneCounts.values()].sort(
      (a, b) => b.count - a.count
    );
    const zone = rankedZones[0]?.display || "";
    const zones = rankedZones.slice(0, 3).map((z) => ({
      location: z.display,
      count: z.count,
    }));

    const riskLevel =
      peak.probability >= 80 ? "HIGH" : peak.probability >= 60 ? "MEDIUM" : "LOW";

    const typeCounts = new Map<string, number>();
    zoneCandidates.forEach((r) => {
      const typeName = r.incident_type || "Incident";
      typeCounts.set(typeName, (typeCounts.get(typeName) || 0) + 1);
    });
    const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
    const totalTypes = sortedTypes.reduce((sum, [, count]) => sum + count, 0) || 1;
    const crimeTypes = sortedTypes.slice(0, 5).map(([label, count]) => ({
      label,
      value: `${Math.round((count / totalTypes) * 100)}%`,
    }));

    const fmtHour = (hour: number) => {
      const display = hour % 12 === 0 ? 12 : hour % 12;
      return `${display}:00 ${hour < 12 ? "AM" : "PM"}`;
    };
    const peakHour = new Date(peak.hour).getHours();
    const startHour = (peakHour - 2 + 24) % 24;
    const endHour = (peakHour + 2) % 24;
    const timeWindow = active.length
      ? `${fmtHour(startHour)} – ${fmtHour(endHour)}`
      : "";

    const trendPct = Math.round(trendFactor * 100);

    const actionFacts: ForecastActionFacts = {
      riskLevel,
      probability: peak.probability,
      zones,
      timeWindow,
      trendPct,
      crimeTypes,
      activeHighCritical: zoneCandidates.length,
      activeTotal: active.length,
    };
    let recommendedActions: string[];
    try {
      recommendedActions = await getRecommendedActions(actionFacts);
    } catch {
      recommendedActions = ruleBasedActions(actionFacts);
    }

    return {
      data: {
        summary: {
          activeIncidents: active.length,
          criticalHotspots,
          avgSentiment,
          sentimentLabel,
          sentimentAnalyzed: successfulLabels.length,
          sentimentTotal: totalSubjects,
          sentimentDistribution: distribution,
          sentimentCoverage: sentimentCoverage([
            ...list.map(report => sentimentMap.get(report.id)),
            ...(commentRows || []).map(comment => commentSentimentMap.get(comment.id)),
          ]),
          credibilityRate,
        },
        sentimentTrend,
        forecast,
        forecastSummary: {
          zone,
          zones,
          riskLevel,
          probability: peak.probability,
          crimeTypes,
          timeWindow,
          trend: trendPct,
          recentCount: recent,
          priorCount: prior,
          activeCount: active.length,
          highSeverityCount: zoneCandidates.length,
          recommendedActions,
        },
      },
      error: null,
    };
  },

  async getReportCoords(reportId: string) {
    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("latitude, longitude")
      .eq("id", reportId)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: "Report not found" };

    return {
      data: {
        latitude: data.latitude != null ? Number(data.latitude) : null,
        longitude: data.longitude != null ? Number(data.longitude) : null,
      },
      error: null,
    };
  },

  async validateReport(reportId: string, input: {
    status?: string;
    is_verified?: boolean;
  }) {
    const { data: report, error: findError } = await supabaseAdmin
      .from("reports")
      .select("id, user_id, location, status, is_verified, incident_type_id, incident_types(name)")
      .eq("id", reportId)
      .maybeSingle();

    if (findError) return { error: findError.message };
    if (!report) return { error: "Report not found" };

    if (input.status !== undefined && !VALID_STATUSES.includes(input.status)) {
      return { error: "Invalid report status." };
    }
    if (input.status === undefined && input.is_verified === true && ["Archived", "Rejected", "Marked Fake"].includes(report.status)) {
      return { error: "Choose a non-rejected, non-archived status before verifying this report." };
    }

    const updates: Record<string, unknown> = {};
    if (input.status !== undefined) updates.status = input.status;
    if (input.is_verified !== undefined) updates.is_verified = input.is_verified;
    if (["Archived", "Rejected", "Marked Fake"].includes(String(updates.status))) updates.is_verified = false;

    const { error: updateError } = await supabaseAdmin
      .from("reports")
      .update(updates)
      .eq("id", reportId);

    if (updateError) return { error: updateError.message };

    const incidentTypeData = report.incident_types as unknown as { name?: string };

    return {
      data: {
        id: report.id,
        ownerId: report.user_id,
        location: report.location ?? "",
        previousStatus: report.status,
        previousVerified: report.is_verified ?? false,
        incidentType: incidentTypeData?.name ?? "an incident",
      },
      error: null,
    };
  },

  async getReportSeverity(reportId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from("report_credibility_analysis")
      .select("severity")
      .eq("report_id", reportId)
      .maybeSingle();

    return data?.severity ?? null;
  },

  async insertAuditLog(input: {
    actorId?: string | null;
    actorName: string;
    actionType: string;
    title: string;
    details?: string;
    reportId?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
  }) {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      actor_id: input.actorId ?? null,
      actor_name: input.actorName,
      action_type: input.actionType,
      title: input.title,
      details: input.details ?? "",
      report_id: input.reportId ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
    });

    if (error) return { error: error.message };
    return { data: true };
  },
};
