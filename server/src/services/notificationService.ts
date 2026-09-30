import { supabaseAdmin } from "../config/supabaseAdmin.js";

type NotifType =
  | "report_status"
  | "nearby_incident"
  | "admin_account"
  | "report_submitted"
  | "ai_validation"
  | "report_approved"
  | "system"
  | "log";

const ADMIN_TYPE_NAMES = [
  "report_submitted",
  "ai_validation",
  "report_approved",
  "admin_account",
  "system",
  "log",
];

const NOTIFICATION_SIGNAL_CHANNEL = "cs-admin-notifications";
const NOTIFICATION_SIGNAL_EVENT = "admin-notifications-changed";

export const notificationService = {
  async getTypeId(name: string) {
    const { data, error } = await supabaseAdmin
      .from("notification_types")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (error) return { id: null, error: error.message };
    if (data) return { id: data.id, error: null };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("notification_types")
      .insert({ name })
      .select("id")
      .maybeSingle();

    if (insertError) return { id: null, error: insertError.message };
    return { id: inserted?.id ?? null, error: null };
  },

  async createNotification(input: {
    userId?: string | null;
    type: NotifType;
    title: string;
    message?: string;
    priority?: "Low" | "Medium" | "High";
    reportId?: string;
    location?: string;
    isVerified?: boolean;
    distanceMeters?: number | string;
    level?: "Low" | "Moderate" | "High";
  }) {
    const { id: typeId, error: typeError } = await this.getTypeId(input.type);
    if (typeError) return { error: typeError };

    const { data: inserted, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: input.userId ?? null,
        type_id: typeId,
        title: input.title,
        message: input.message ?? "",
        priority: input.priority ?? "Low",
      })
      .select("id")
      .maybeSingle();

    if (error || !inserted) return { error: error?.message ?? "Insert failed" };

    if (input.type === "nearby_incident") {
      const { error: childError } = await supabaseAdmin
        .from("notification_nearby_incident")
        .insert({
          notification_id: inserted.id,
          report_id: input.reportId ?? null,
          distance_meters: input.distanceMeters ?? null,
          level: input.level ?? "Moderate",
        });
      if (childError) return { error: childError.message };
    } else if (input.reportId) {
      const { error: childError } = await supabaseAdmin
        .from("notification_report_status")
        .insert({
          notification_id: inserted.id,
          report_id: input.reportId,
          location: input.location ?? null,
          is_verified: input.isVerified ?? false,
        });
      if (childError) return { error: childError.message };
    }

    return { data: inserted.id };
  },

  haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  },

  async notifyNearbyUsers(input: {
    reportId: string;
    latitude: number | null;
    longitude: number | null;
    title: string;
    message?: string;
    level?: "Low" | "Moderate" | "High";
    radiusMeters?: number;
    excludeUserId?: string;
  }) {
    const {
      reportId,
      latitude,
      longitude,
      title,
      message,
      level = "Moderate",
      radiusMeters = 3000,
      excludeUserId,
    } = input;

    if (latitude == null || longitude == null) return { data: 0, error: null };

    const { data: reports, error: rError } = await supabaseAdmin
      .from("reports")
      .select("user_id, latitude, longitude, created_at")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (rError) return { data: null, error: rError.message };

    const latestByUser = new Map<string, { lat: number; lng: number }>();
    (reports || []).forEach(
      (r: { user_id: string | null; latitude: number; longitude: number }) => {
        if (!r.user_id) return;
        if (!latestByUser.has(r.user_id)) {
          latestByUser.set(r.user_id, {
            lat: Number(r.latitude),
            lng: Number(r.longitude),
          });
        }
      }
    );

    const { data: adminRows } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"]);
    const adminIds = new Set((adminRows || []).map((a: { id: string }) => a.id));

    let notified = 0;
    for (const [userId, coords] of latestByUser.entries()) {
      if (excludeUserId && userId === excludeUserId) continue;
      if (adminIds.has(userId)) continue;

      const distance = this.haversineMeters(
        latitude,
        longitude,
        coords.lat,
        coords.lng
      );
      if (distance > radiusMeters) continue;

      const { error } = await this.createNotification({
        userId,
        type: "nearby_incident",
        title,
        message: message ?? `A new incident was reported ${distance} m from you.`,
        reportId,
        distanceMeters: distance,
        level,
      });
      if (!error) notified += 1;
    }

    return { data: notified, error: null };
  },

  async notifyAllAdmins(input: {
    reportId?: string;
    title: string;
    message: string;
    priority?: "Low" | "Medium" | "High";
    excludeUserId?: string;
    type?: NotifType;
  }) {
    const {
      reportId,
      title,
      message,
      priority = "High",
      excludeUserId,
      type = "report_submitted",
    } = input;

    const { data: admins, error: adminError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"]);

    if (adminError) return { data: null, error: adminError.message };

    let notified = 0;
    for (const admin of admins || []) {
      if (excludeUserId && admin.id === excludeUserId) continue;

      const { error } = await this.createNotification({
        userId: admin.id,
        type,
        title,
        message,
        priority,
        ...(reportId ? { reportId } : {}),
      });
      if (!error) notified += 1;
    }

    if (notified > 0) {
      await this.publishNotificationsChanged();
    }

    return { data: notified, error: null };
  },

  async publishNotificationsChanged() {
    const channel = supabaseAdmin.channel(NOTIFICATION_SIGNAL_CHANNEL);

    try {
      const joined = await Promise.race([
        new Promise<boolean>((resolve) => {
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              resolve(true);
              return;
            }
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              resolve(false);
            }
          });
        }),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 2500);
        }),
      ]);

      if (joined) {
        await channel.send({
          type: "broadcast",
          event: NOTIFICATION_SIGNAL_EVENT,
          payload: {},
        });
      }
    } catch {
    } finally {
      try {
        await supabaseAdmin.removeChannel(channel);
      } catch {
      }
    }
  },

  async createLoginActivity(input: {
    userId: string;
    device: string;
    location?: string;
    isCurrent?: boolean;
  }) {
    const { error } = await supabaseAdmin.from("login_activities").insert({
      user_id: input.userId,
      device: input.device,
      location: input.location ?? null,
      is_current: input.isCurrent ?? false,
    });

    if (error) return { error: error.message };
    return { data: true };
  },

  async listUserNotifications(userId: string) {
    const { data: types, error: typesError } = await supabaseAdmin
      .from("notification_types")
      .select("id, name");

    if (typesError) return { data: null, error: typesError.message };

    const typeIdByName = new Map<string, string>();
    (types || []).forEach((t: { id: string; name: string }) =>
      typeIdByName.set(t.name, t.id)
    );

    const {
      data: notifications,
      error: nError,
    } = await supabaseAdmin
      .from("notifications")
      .select("id, type_id, title, message, priority, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (nError) return { data: null, error: nError.message };

    const baseIds = (notifications || []).map((n) => n.id);

    const { data: reportStatusRows, error: rsError } = baseIds.length
      ? await supabaseAdmin
          .from("notification_report_status")
          .select("notification_id, report_id, location, is_verified")
          .in("notification_id", baseIds)
      : { data: [], error: null };
    if (rsError) return { data: null, error: rsError.message };

    const { data: nearbyRows, error: niError } = baseIds.length
      ? await supabaseAdmin
          .from("notification_nearby_incident")
          .select("notification_id, report_id, distance_meters, level")
          .in("notification_id", baseIds)
      : { data: [], error: null };
    if (niError) return { data: null, error: niError.message };

    const childById = new Map<string, Record<string, unknown>>();
    (reportStatusRows || []).forEach((r: { notification_id: string }) =>
      childById.set(r.notification_id, r as Record<string, unknown>)
    );
    (nearbyRows || []).forEach((r: { notification_id: string }) =>
      childById.set(r.notification_id, r as Record<string, unknown>)
    );

    const reportStatuses = [];
    const nearbyIncidents = [];

    for (const n of notifications || []) {
      const typeId = String(n.type_id);
      const base = {
        id: n.id,
        title: n.title,
        message: n.message,
        time: n.created_at,
        isRead: n.is_read,
      };

      const child = childById.get(n.id);

      if (typeId === typeIdByName.get("report_status")) {
        reportStatuses.push({
          ...base,
          reportId: child?.report_id ?? null,
          location: child?.location ?? "",
          verified: child?.is_verified ?? false,
        });
      }

      if (typeId === typeIdByName.get("nearby_incident")) {
        nearbyIncidents.push({
          ...base,
          type: n.title,
          reportId: child?.report_id ?? null,
          distance: child?.distance_meters
            ? `${child.distance_meters} m away`
            : "",
          level: child?.level ?? "Moderate",
        });
      }
    }

    return { data: { reportStatuses, nearbyIncidents }, error: null };
  },

  async listLoginActivities(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("login_activities")
      .select("id, device, location, is_current, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: error.message };

    const activities = (data || []).map((a) => ({
      id: a.id,
      device: a.device,
      location: a.location ?? "",
      time: a.created_at,
      current: a.is_current ?? false,
    }));

    return { data: activities, error: null };
  },

  async listAdminNotifications(userId?: string, limit = 10, offset = 0) {
    const { data: types, error: typesError } = await supabaseAdmin
      .from("notification_types")
      .select("id, name");

    if (typesError) return { data: null, error: typesError.message };

    const nameByTypeId = new Map<string, string>();
    const typeIdByName = new Map<string, string>();
    (types || []).forEach((t: { id: string; name: string }) => {
      nameByTypeId.set(t.id, t.name);
      typeIdByName.set(t.name, t.id);
    });

    const adminTypeIds = ADMIN_TYPE_NAMES.map((name) =>
      typeIdByName.get(name)
    ).filter((id): id is string => !!id);

    let countQuery = supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);

    if (adminTypeIds.length > 0) {
      countQuery = countQuery.in("type_id", adminTypeIds);
    }
    if (userId) {
      countQuery = countQuery.eq("user_id", userId);
    }
    const { count: unreadCount } = await countQuery;

    let pageQuery = supabaseAdmin
      .from("notifications")
      .select("id, type_id, title, message, priority, is_read, created_at")
      .order("created_at", { ascending: false });

    if (adminTypeIds.length > 0) {
      pageQuery = pageQuery.in("type_id", adminTypeIds);
    }
    if (userId) {
      pageQuery = pageQuery.eq("user_id", userId);
    }

    const { data, error } = await pageQuery.range(offset, offset + limit - 1);

    if (error) return { data: null, error: error.message };

    const page = data || [];
    const pageIds = page.map((n) => n.id);
    const { data: linkRows } = pageIds.length
      ? await supabaseAdmin
          .from("notification_report_status")
          .select("notification_id, report_id")
          .in("notification_id", pageIds)
      : { data: [] };
    const reportByNotification = new Map<string, string>();
    (linkRows || []).forEach(
      (r: { notification_id: string; report_id: string | null }) => {
        if (r.report_id) reportByNotification.set(r.notification_id, r.report_id);
      }
    );

    const notifications = page.map((n) => {
      const rawType = nameByTypeId.get(String(n.type_id)) || "system";
      let type = "system";
      if (rawType === "report_submitted") type = "report";
      else if (rawType === "ai_validation") type = "ai";
      else if (
        rawType === "report_approved" ||
        rawType === "admin_account"
      ) {
        type = "admin";
      }

      return {
        id: n.id,
        type,
        title: n.title,
        message: n.message,
        time: n.created_at,
        priority: n.priority ?? "Low",
        unread: !n.is_read,
        reportId: reportByNotification.get(String(n.id)) ?? null,
        route:
          type === "report" || type === "ai"
            ? "/(admin)/Admin_Validation"
            : "/(admin)/Admin_Logs",
      };
    });

    return {
      data: {
        notifications,
        unreadCount: unreadCount ?? 0,
        hasMore: page.length === limit,
      },
      error: null,
    };
  },

  async markRead(userId: string, notificationId: string) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (error) return { error: error.message };
    return { data: true };
  },

  async markAllRead(userId: string) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) return { error: error.message };
    return { data: true };
  },

  async markAdminRead(notificationId: string) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) return { error: error.message };
    return { data: true };
  },

  async markAdminAllRead(userId?: string) {
    const { data: types, error: typesError } = await supabaseAdmin
      .from("notification_types")
      .select("id, name");

    if (typesError) return { error: typesError.message };

    const adminTypeIds = (types || [])
      .filter((t: { name: string }) => ADMIN_TYPE_NAMES.includes(t.name))
      .map((t: { id: string }) => t.id);

    let query = supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false);

    if (adminTypeIds.length > 0) query = query.in("type_id", adminTypeIds);
    if (userId) query = query.eq("user_id", userId);

    const { error } = await query;

    if (error) return { error: error.message };
    return { data: true };
  },
};