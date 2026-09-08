import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { reverseGeocode } from "../utils/geocode.js";

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

const VALID_STATUSES = [
  "Pending Review",
  "Under Verification",
  "Resolved",
  "Rejected",
  "Archived",
  "Marked Fake",
];

const ARGAO_BARANGAYS = [
  "Poblacion",
  "Lamacan",
  "Talaga",
  "Canbanua",
  "Bugang",
  "Conalum",
  "Dawis",
  "Guiwanon",
  "Kabangkalan",
  "Kasambagan",
  "Langtad",
  "Mango",
  "Matic",
  "Mindalusan",
  "Oboj",
  "Osang",
  "Pajija",
  "Tulic",
  "San Miguel",
  "Binlod",
  "Tagaytay",
  "Taloot",
];

function deriveBarangay(location: string): string {
  const loc = (location || "").toLowerCase();
  if (!loc) return "";
  for (const barangay of ARGAO_BARANGAYS) {
    if (loc.includes(barangay.toLowerCase())) return barangay;
  }
  const first = loc.split(",")[0]?.trim() || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

function categoryNameOf(rel: unknown): string {
  if (!rel) return "";
  if (Array.isArray(rel)) {
    const first = rel[0] as { name?: string } | undefined;
    return first?.name ?? "";
  }
  return (rel as { name?: string }).name ?? "";
}

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
    const category = (input.incident_category || "").trim();
    const type = (input.incident_type || "").trim();

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

    const { data: report, error } = await supabaseAdmin
      .from("reports")
      .insert({
        user_id: userId,
        incident_type_id: incidentTypeId,
        location: input.location ?? "",
        latitude: input.latitude ? Number(input.latitude) : null,
        longitude: input.longitude ? Number(input.longitude) : null,
        poster_name: input.poster_name ?? "",
        display_name_type: input.display_name_type ?? "Fullname",
        details: (input.details || "").trim(),
        status,
        is_verified: input.is_verified ?? false,
        role: input.role ?? "user",
      })
      .select("id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!report) return { error: "Failed to create report" };

    const latNum = input.latitude ? Number(input.latitude) : null;
    const lngNum = input.longitude ? Number(input.longitude) : null;
    if (latNum && lngNum) {
      const resolved = await reverseGeocode(latNum, lngNum);
      if (resolved) {
        await supabaseAdmin
          .from("reports")
          .update({ location: resolved })
          .eq("id", report.id);
      }
    }

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

    return { data: report.id };
  },

  async listReports(viewerId?: string) {
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

    const { data: reports, error: reportError } = await supabaseAdmin
      .from("reports")
      .select(
        "id, user_id, location, latitude, longitude, details, poster_name, display_name_type, status, is_verified, created_at, incident_type_id, role"
      )
      .order("created_at", { ascending: false });

    if (reportError) return { data: null, error: reportError.message };

    const reportIds = (reports || []).map((r) => r.id);

    const { data: images, error: imageError } = reportIds.length
      ? await supabaseAdmin
          .from("report_images")
          .select("report_id, image_url")
          .in("report_id", reportIds)
          .order("position", { ascending: true })
      : { data: [], error: null };

    if (imageError) return { data: null, error: imageError.message };

    const imagesByReport = new Map<string, string[]>();
    (images || []).forEach((img: { report_id: string; image_url: string }) => {
      const list = imagesByReport.get(img.report_id) || [];
      list.push(img.image_url);
      imagesByReport.set(img.report_id, list);
    });

    const likesByReport = new Map<string, number>();
    const likedByUser = new Set<string>();
    if (reportIds.length > 0) {
      const { data: likes, error: likeError } = await supabaseAdmin
        .from("report_likes")
        .select("report_id, user_id")
        .in("report_id", reportIds);
      if (likeError) return { data: null, error: likeError.message };

      (likes || []).forEach(
        (l: { report_id: string; user_id: string | null }) => {
          likesByReport.set(l.report_id, (likesByReport.get(l.report_id) || 0) + 1);
          if (l.user_id) likedByUser.add(`${l.report_id}:${l.user_id}`);
        }
      );
    }

    const commentsByReport = new Map<string, number>();
    if (reportIds.length > 0) {
      const { data: commentRows, error: commentError } = await supabaseAdmin
        .from("report_comments")
        .select("report_id")
        .in("report_id", reportIds);
      if (commentError) return { data: null, error: commentError.message };

      (commentRows || []).forEach((c: { report_id: string }) => {
        commentsByReport.set(c.report_id, (commentsByReport.get(c.report_id) || 0) + 1);
      });
    }

    const enriched = (reports || []).map((r) => {
      const typeInfo = typeMap.get(r.incident_type_id) || {
        type: "",
        category: "",
      };
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
        images: imagesByReport.get(r.id) || [],
        likes: likesByReport.get(r.id) || 0,
        comments: commentsByReport.get(r.id) || 0,
        is_liked: viewerId ? likedByUser.has(`${r.id}:${viewerId}`) : false,
      };
    });

    const userIds = enriched
      .map((r) => r.user_id)
      .filter((id): id is string => !!id);

    const nameByUser = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, fullname, user_name")
        .in("id", userIds);

      if (!profileError) {
        (profiles || []).forEach(
          (p: { id: string; fullname: string | null; user_name: string | null }) => {
            nameByUser.set(p.id, p.fullname || p.user_name || "");
          }
        );
      }
    }

    const final = enriched.map((r) => ({
      ...r,
      poster_name: r.poster_name || nameByUser.get(r.user_id) || "Anonymous User",
    }));

    return { data: final, error: null };
  },

  async listMyReports(userId: string) {
    const all = await this.listReports(userId);
    if (all.error) return all;

    const filtered = (all.data || []).filter((r) => r.user_id === userId);

    return { data: filtered, error: null };
  },

  async updateReport(userId: string, reportId: string, input: ReportInput) {
    const { data: own } = await supabaseAdmin
      .from("reports")
      .select("id")
      .eq("id", reportId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!own) return { error: "Report not found" };

    const updates: Record<string, unknown> = {};
    if (input.details !== undefined) updates.details = (input.details || "").trim();
    if (input.location !== undefined) updates.location = input.location;
    if (input.poster_name !== undefined) updates.poster_name = input.poster_name;

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

    const category = (input.incident_category || "").trim();
    const type = (input.incident_type || "").trim();

    if (category && type) {
      const { id: incidentTypeId, error: resolveError } = await resolveIncidentType(
        category,
        type
      );
      if (resolveError) return { error: resolveError };
      updates.incident_type_id = incidentTypeId;
    }

    const { error: updateError } = await supabaseAdmin
      .from("reports")
      .update(updates)
      .eq("id", reportId)
      .eq("user_id", userId);

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

  async deleteReport(userId: string, reportId: string) {
    const { data: own, error: checkError } = await supabaseAdmin
      .from("reports")
      .select("id")
      .eq("id", reportId)
      .eq("user_id", userId)
      .maybeSingle();

    if (checkError) return { error: checkError.message };
    if (!own) return { error: "Report not found" };

    const { error } = await supabaseAdmin
      .from("reports")
      .delete()
      .eq("id", reportId)
      .eq("user_id", userId);

    if (error) return { error: error.message };

    return { data: reportId };
  },

  async addComment(userId: string, reportId: string, content: string) {
    const text = (content || "").trim();
    if (!text) return { error: "Comment is required" };

    const { error } = await supabaseAdmin.from("report_comments").insert({
      report_id: reportId,
      user_id: userId,
      content: text,
    });

    if (error) return { error: error.message };
    return { data: true };
  },

  async listComments(reportId: string) {
    const { data, error } = await supabaseAdmin
      .from("report_comments")
      .select("id, user_id, content, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (error) return { data: null, error: error.message };

    const userIds = [...new Set((data || []).map((c) => c.user_id).filter(Boolean))];

    const nameByUser = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, fullname, user_name")
        .in("id", userIds);
      (profiles || []).forEach(
        (p: { id: string; fullname: string | null; user_name: string | null }) =>
          nameByUser.set(p.id, p.fullname || p.user_name || "User")
      );
    }

    const comments = (data || []).map((c) => ({
      id: c.id,
      user: nameByUser.get(c.user_id) || "User",
      text: c.content,
      datePosted: c.created_at,
    }));

    return { data: comments, error: null };
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
      return { data: { liked: false }, error: null };
    }

    const { error } = await supabaseAdmin.from("report_likes").insert({
      report_id: reportId,
      user_id: userId,
    });
    if (error) return { error: error.message, liked: false };
    return { data: { liked: true }, error: null };
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

  async listAdminPosts() {
    const { data, error } = await supabaseAdmin
      .from("admin_posts")
      .select("id, admin_id, type, location, details, pic_url, created_at")
      .order("created_at", { ascending: false });

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
    input: { type?: string; location?: string; details?: string; pic_url?: string }
  ) {
    const type = (input.type || "").trim();
    const details = (input.details || "").trim();

    if (!type || !details) {
      return { error: "Announcement type and details are required" };
    }

    const { data: announcement, error } = await supabaseAdmin
      .from("admin_announcement")
      .insert({
        admin_id: adminId,
        type,
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

  async listAuditLogs() {
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select(
        "id, actor_name, action_type, title, details, report_id, old_value, new_value, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return { data: null, error: error.message };

    const logs = (data || []).map((l) => ({
      id: l.id,
      actionType: l.action_type,
      title: l.title ?? "",
      actor: l.actor_name ?? "System",
      reportId: l.report_id ?? "",
      details: l.details ?? "",
      oldStatus: l.old_value ?? "",
      newStatus: l.new_value ?? "",
      dateTime: l.created_at,
    }));

    return { data: logs, error: null };
  },

  async getAdminDashboard() {
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

    const { data: reports, error: reportError } = await supabaseAdmin
      .from("reports")
      .select(
        "id, location, latitude, longitude, details, poster_name, status, is_verified, created_at, incident_type_id, role"
      )
      .order("created_at", { ascending: false });

    if (reportError) return { data: null, error: reportError.message };

    const reportIds = (reports || []).map((r) => r.id);

    const { data: analyses, error: analysisError } = reportIds.length
      ? await supabaseAdmin
          .from("report_credibility_analysis")
          .select("report_id, ai_score, severity, sentiment, credibility_review")
          .in("report_id", reportIds)
      : { data: [], error: null };

    if (analysisError) return { data: null, error: analysisError.message };

    const analysisMap = new Map<
      string,
      {
        ai_score: number | null;
        severity: string;
        sentiment: string;
        credibility_review: string;
      }
    >();
    (analyses || []).forEach(
      (a: {
        report_id: string;
        ai_score: number | null;
        severity: string | null;
        sentiment: string | null;
        credibility_review: string | null;
      }) => {
        analysisMap.set(a.report_id, {
          ai_score: a.ai_score ?? null,
          severity: a.severity ?? "Medium",
          sentiment: a.sentiment ?? "Neutral",
          credibility_review: a.credibility_review ?? "",
        });
      }
    );

    const { data: commentRows, error: commentsError } = reportIds.length
      ? await supabaseAdmin
          .from("report_comments")
          .select("report_id, content")
          .in("report_id", reportIds)
      : { data: [], error: null };

    if (commentsError) return { data: null, error: commentsError.message };

    const commentsByReport = new Map<string, string[]>();
    (commentRows || []).forEach((c: { report_id: string; content: string }) => {
      const list = commentsByReport.get(c.report_id) || [];
      list.push(c.content);
      commentsByReport.set(c.report_id, list);
    });

    const { data: images, error: imageError } = reportIds.length
      ? await supabaseAdmin
          .from("report_images")
          .select("report_id, image_url")
          .in("report_id", reportIds)
          .order("position", { ascending: true })
      : { data: [], error: null };

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
        sentiment: "Neutral",
        credibility_review: "",
      };
      return {
        id: r.id,
        location: r.location ?? "",
        barangay: deriveBarangay(r.location ?? ""),
        details: r.details ?? "",
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
        sentiment: analysis.sentiment ?? "Neutral",
        credibility_review: analysis.credibility_review ?? "",
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

    const { data: reports, error: reportError } = await supabaseAdmin
      .from("reports")
      .select(
        "id, location, latitude, longitude, poster_name, status, is_verified, created_at, incident_type_id"
      )
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    if (reportError) return { data: null, error: reportError.message };

    const reportIds = (reports || []).map((r) => r.id);

    const { data: analyses, error: analysisError } = reportIds.length
      ? await supabaseAdmin
          .from("report_credibility_analysis")
          .select("report_id, ai_score, severity, sentiment")
          .in("report_id", reportIds)
      : { data: [], error: null };

    if (analysisError) return { data: null, error: analysisError.message };

    const analysisMap = new Map<
      string,
      { ai_score: number | null; severity: string; sentiment: string }
    >();
    (analyses || []).forEach(
      (a: {
        report_id: string;
        ai_score: number | null;
        severity: string | null;
        sentiment: string | null;
      }) => {
        analysisMap.set(a.report_id, {
          ai_score: a.ai_score ?? null,
          severity: a.severity ?? "Medium",
          sentiment: a.sentiment ?? "Neutral",
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
        sentiment: "Neutral",
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
        sentiment: analysis.sentiment ?? "Neutral",
      };
    });

    const SENTIMENT_POLARITY: Record<string, number> = {
      Anxious: 1,
      Concerned: 0.8,
      Negative: 0.7,
      Unclear: 0.5,
      Neutral: 0.4,
      Positive: 0.2,
    };

    const SEVERITY_WEIGHT: Record<string, number> = {
      Low: 1,
      Medium: 2,
      High: 3,
      Critical: 4,
    };

    const active = list.filter(
      (r) => !["Rejected", "Archived"].includes(r.status)
    );

    const criticalHotspots = active.filter(
      (r) => r.severity === "High" || r.severity === "Critical"
    ).length;

    const avgPolarity = list.length
      ? list.reduce(
          (sum, r) => sum + (SENTIMENT_POLARITY[r.sentiment] ?? 0.5),
          0
        ) / list.length
      : 0.5;
    const avgSentiment = (avgPolarity * 5).toFixed(1);
    const sentimentLabel =
      avgPolarity >= 0.75
        ? "Anxious"
        : avgPolarity >= 0.6
          ? "Concerned"
          : avgPolarity >= 0.45
            ? "Neutral"
            : "Calm";

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
      const bucket = list.filter((r) => {
        const t = new Date(r.created_at);
        return t >= start && t < end;
      });
      const value = bucket.length
        ? Math.round(
            (bucket.reduce(
              (sum, r) => sum + (SENTIMENT_POLARITY[r.sentiment] ?? 0.5),
              0
            ) /
              bucket.length) *
              100
          )
        : 0;
      return { hour: start.getHours(), value, count: bucket.length };
    });

    const hourWeights = new Array(24).fill(0);
    list.forEach((r) => {
      const h = new Date(r.created_at).getHours();
      hourWeights[h] += SEVERITY_WEIGHT[r.severity] ?? 2;
    });
    const maxHourWeight = Math.max(1, ...hourWeights);

    let recent = 0;
    let prior = 0;
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now.getTime() - 14 * 24 * 60 * 60 * 1000;
    list.forEach((r) => {
      const t = new Date(r.created_at).getTime();
      if (t >= weekAgo) recent += 1;
      else if (t >= twoWeeksAgo) prior += 1;
    });
    const trendFactor =
      recent + prior ? (recent - prior) / Math.max(1, recent + prior) : 0;

    const forecast = Array.from({ length: 48 }, (_, i) => {
      const target = new Date(now.getTime() + i * 60 * 60 * 1000);
      const h = target.getHours();
      const base = hourWeights[h] / maxHourWeight;
      let probability = base * 100 + trendFactor * 20 * ((i + 1) / 48);
      probability = Math.min(100, Math.max(3, Math.round(probability)));
      return { hour: target.getTime(), probability };
    });

    const peak = forecast.reduce((best, f) =>
      f.probability > best.probability ? f : best
    );

    const zoneCandidates = active.filter(
      (r) => r.severity === "High" || r.severity === "Critical"
    );
    const zoneCounts = new Map<string, number>();
    zoneCandidates.forEach((r) => {
      const zoneName = r.location && r.location.trim() ? r.location.trim() : "Unspecified";
      zoneCounts.set(zoneName, (zoneCounts.get(zoneName) || 0) + 1);
    });
    const zone =
      [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Argao";

    const riskLevel =
      peak.probability >= 80 ? "HIGH" : peak.probability >= 60 ? "MEDIUM" : "LOW";

    const inZone = zoneCandidates.filter(
      (r) => (r.location && r.location.trim()) === zone
    );
    const typeCounts = new Map<string, number>();
    inZone.forEach((r) => {
      const typeName = r.incident_type || "Incident";
      typeCounts.set(typeName, (typeCounts.get(typeName) || 0) + 1);
    });
    const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
    const totalTypes = sortedTypes.reduce((sum, [, count]) => sum + count, 0) || 1;
    const crimeTypes = sortedTypes.slice(0, 3).map(([label, count]) => ({
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
    const timeWindow = `${fmtHour(startHour)} – ${fmtHour(endHour)}`;

    const trendPct = Math.round(trendFactor * 100);

    const recommendedActions: string[] = [];
    if (riskLevel === "HIGH") {
      recommendedActions.push("Increase patrol in the predicted hotspot area");
    }
    if (riskLevel !== "LOW") {
      recommendedActions.push("Notify nearest response units and prepare standby");
    }
    recommendedActions.push("Review similar reports in the area for context");
    if (criticalHotspots > 0) {
      recommendedActions.push("Prioritize verified high-severity reports for resolution");
    }

    return {
      data: {
        summary: {
          activeIncidents: active.length,
          criticalHotspots,
          avgSentiment,
          sentimentLabel,
          credibilityRate,
        },
        sentimentTrend,
        forecast,
        forecastSummary: {
          zone,
          riskLevel,
          probability: peak.probability,
          crimeTypes,
          timeWindow,
          trend: trendPct,
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

    const updates: Record<string, unknown> = {};
    if (input.status !== undefined) updates.status = input.status;
    if (input.is_verified !== undefined) updates.is_verified = input.is_verified;

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