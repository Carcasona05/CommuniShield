import type { Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin.ts";
import type { User } from "@supabase/supabase-js";
import { profileService } from "../services/authService.ts";
import { reportService } from "../services/reportService.ts";

type AuthRequest = import("express").Request & { user?: User; token?: string };

export const getAccounts = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({ error: "Only super admin can view admin accounts" });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, phone, role, department, status, created_at, updated_at")
      .in("role", ["admin", "super_admin"])
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const accounts = await Promise.all(
      (data || []).map(async (acc) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(acc.id);
        return {
          id: acc.id,
          name: acc.first_name ?? "",
          email: userData?.user?.email ?? "",
          phone: acc.phone ?? "",
          role: acc.role,
          department: acc.department ?? "",
          status: acc.status ?? "Active",
          createdAt: acc.created_at,
        };
      })
    );

    res.json({ accounts });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({ error: "Only super admin can update accounts" });
    }

    const id = String(req.params.id);
    const { name, email, role, department, phone, status } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.first_name = name;
    if (role !== undefined) updates.role = role;
    if (department !== undefined) updates.department = department;
    if (phone !== undefined) updates.phone = phone;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("id", id);

      if (updateError) return res.status(500).json({ error: updateError.message });
    }

    if (email !== undefined) {
      const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(id, { email });
      if (emailError) return res.status(500).json({ error: emailError.message });
    }

    const { data: actorProfile } = await profileService.getProfile(user.id);
    const changedFields = Object.keys(updates).join(", ") || (email !== undefined ? "email" : "");

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: actorProfile?.fullname || "Super Admin",
      actionType: "Admin Updated",
      title: "Admin account updated",
      details: `Admin account ${id} was updated by ${actorProfile?.fullname || "super admin"}. Changed: ${changedFields}.`,
      oldValue: changedFields || null,
    }).catch(() => {});

    res.json({ message: "Account updated successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteAccount = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({ error: "Only super admin can delete accounts" });
    }

    const { id } = req.params;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(String(id));
    if (error) return res.status(500).json({ error: error.message });

    const { data: actorProfile } = await profileService.getProfile(user.id);

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: actorProfile?.fullname || "Super Admin",
      actionType: "Admin Deleted",
      title: "Admin account deleted",
      details: `Admin account ${id} was deleted by ${actorProfile?.fullname || "super admin"}.`,
      reportId: String(id),
    }).catch(() => {});

    res.json({ message: "Account deleted successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const toggleStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({ error: "Only super admin can change account status" });
    }

    const { id } = req.params;

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("status")
      .eq("id", id)
      .single();

    const newStatus = target?.status === "Active" ? "Disabled" : "Active";

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) return res.status(500).json({ error: error.message });

    const { data: actorProfile } = await profileService.getProfile(user.id);

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: actorProfile?.fullname || "Super Admin",
      actionType: newStatus === "Disabled" ? "Admin Disabled" : "Admin Updated",
      title: `Admin account ${newStatus.toLowerCase()}`,
      details: `Admin account ${id} was ${newStatus.toLowerCase()} by ${actorProfile?.fullname || "super admin"}.`,
      reportId: String(id),
      oldValue: target?.status || "Active",
      newValue: newStatus,
    }).catch(() => {});

    res.json({ message: `Account ${newStatus.toLowerCase()}`, status: newStatus });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
