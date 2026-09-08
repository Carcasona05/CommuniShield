import { createSupabaseUser } from "../config/supabaseUser.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";

const normalizeRole = (role?: string): string => {
  const r = role?.toLowerCase().trim() || "";
  if (r.includes("super")) return "super_admin";
  return "admin";
};

export const profileService = {

  async getProfile(userId: string) {
    const result = await supabaseAdmin
      .from("profiles")
      .select("fullname, user_name, first_name, last_name, middle_name, phone, role, status, birthdate, location, department")
      .eq("id", userId)
      .maybeSingle();

    if (!result.data) {
      await this.ensureProfile(userId);
    }

    return await supabaseAdmin
      .from("profiles")
      .select("fullname, user_name, first_name, last_name, middle_name, phone, role, status, birthdate, location, department")
      .eq("id", userId)
      .maybeSingle();
  },

  async ensureProfile(userId: string) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const meta = userData?.user?.user_metadata ?? {};

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, user_name, first_name, last_name, middle_name, phone, birthdate, location, department")
      .eq("id", userId)
      .maybeSingle();

    const payload = {
      user_name: meta.userName ?? meta.name ?? "",
      first_name: meta.firstName ?? "",
      middle_name: meta.middleName ?? "",
      last_name: meta.lastName ?? "",
      phone: meta.phone ?? "",
      birthdate: meta.birthdate ?? null,
      location: meta.location ?? "",
      department: meta.department ?? "",
    };

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (!existing.user_name && payload.user_name) updates.user_name = payload.user_name;
      if (!existing.first_name && payload.first_name) updates.first_name = payload.first_name;
      if (!existing.middle_name && payload.middle_name) updates.middle_name = payload.middle_name;
      if (!existing.last_name && payload.last_name) updates.last_name = payload.last_name;
      if (!existing.phone && payload.phone) updates.phone = payload.phone;
      if (!existing.birthdate && payload.birthdate) updates.birthdate = payload.birthdate;
      if (!existing.location && payload.location) updates.location = payload.location;
      if (!existing.department && payload.department) updates.department = payload.department;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update(updates)
          .eq("id", userId);
        if (error) console.error("ensureProfile update error:", error.message);
      }
      return;
    }

    const { error } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      role: "user",
      ...payload,
    });

    if (error) console.error("ensureProfile insert error:", error.message);
  },

  async updateName(userId: string, data: { name?: string }, token: string) {
    const supabaseUser = createSupabaseUser(token);

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.first_name = data.name;

    return await supabaseUser
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .maybeSingle();
  },

  async updateProfileFields(userId: string, data: Record<string, unknown>) {
    return await supabaseAdmin
      .from("profiles")
      .update(data)
      .eq("id", userId)
      .select()
      .maybeSingle();
  },

  async updateAuth(userId: string, data: { email?: string; password?: string }) {
    return await supabaseAdmin.auth.admin.updateUserById(userId, data);
  },

  async createAdmin(email: string, password: string, name: string, role?: string, department?: string, phone?: string) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) return { error };

    const updates: Record<string, unknown> = {
      first_name: name,
      middle_name: "",
      last_name: "",
      role: normalizeRole(role),
    };
    if (department) updates.department = department;
    if (phone) updates.phone = phone;

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", data.user.id);

    if (updateError) return { error: updateError };

    return { data };
  },
};