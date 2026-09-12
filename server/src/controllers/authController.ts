import type { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import type { User } from "@supabase/supabase-js";
import { profileService } from "../services/authService.js";
import { notificationService } from "../services/notificationService.js";
import { credibilityService } from "../services/credibilityService.js";
import { reportService } from "../services/reportService.js";

type AuthRequest = Request & { user?: User; token?: string };

const detectDevice = (userAgent?: string): string => {
  const ua = userAgent || "";
  if (/mobile|iphone|ipad|android/i.test(ua)) {
    return /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : "Mobile Device";
  }
  if (/samsung/i.test(ua)) return "Samsung Device";
  if (/chrome/i.test(ua)) return "Chrome Browser";
  if (/firefox/i.test(ua)) return "Firefox Browser";
  if (/safari/i.test(ua)) return "Safari Browser";
  return "Unknown Device";
};

export const register = async (req: Request, res: Response) => {
  try {
    const { userName, email, password } = req.body;

    if (!userName || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { userName },
    });

    if (error) return res.status(400).json({ error: error.message });

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) return res.status(401).json({ error: authError.message });

    res.json({
      message: "Registered",
      access_token: authData.session?.access_token ?? null,
      user: authData.user,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return res.status(401).json({ error: error.message });

    try {
      await notificationService.createLoginActivity({
        userId: data.user.id,
        device: detectDevice(req.headers["user-agent"]),
        location: "Philippines",
        isCurrent: true,
      });
    } catch {
      // login activity logging is best-effort
    }

    res.json({
      message: "Login successful",
      access_token: data.session?.access_token ?? null,
      user: data.user,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return res.status(401).json({ error: error.message });

    const token = data.session?.access_token;
    if (!token) return res.status(401).json({ error: "No session token" });

    const { data: profile, error: profileErr } = await profileService.getProfile(data.user.id);

    if (profileErr) {
      return res.status(500).json({ error: "Profile query failed", detail: profileErr.message });
    }

    if (!profile) {
      return res.status(403).json({ error: "No profile found for this account. Contact super admin." });
    }

    if (profile.status === "Disabled") {
      return res.status(403).json({ error: "Your account is disabled. Contact the super admin." });
    }

    if (profile.role === "user") {
      return res.status(403).json({ error: "Admin access only." });
    }

    res.json({
      message: "Admin login successful",
      access_token: token,
      user: { ...data.user, name: profile.fullname, role: profile.role },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const adminRegister = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await profileService.getProfile(user.id);
    if (!profile || profile.role !== "super_admin") {
      return res.status(403).json({ error: "Only super admin can create admins" });
    }

    const { email, password, name, role, department, phone } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    const result = await profileService.createAdmin(email, password, name, role, department, phone);
    if (result.error) return res.status(400).json({ error: result.error.message });

    const { data: actorProfile } = await profileService.getProfile(user.id);

    await reportService.insertAuditLog({
      actorId: user.id,
      actorName: actorProfile?.fullname || "Super Admin",
      actionType: "Admin Added",
      title: "Admin account created",
      details: `New admin account "${name}" (${email}) was created by ${actorProfile?.fullname || "super admin"}.`,
      newValue: email,
    }).catch(() => {});

    res.json({ message: "Admin created successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProfile = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  const { data } = await profileService.getProfile(user.id);

  const meta = user.user_metadata ?? {};
  const fallbackName = meta.userName ?? meta.name ?? user.email ?? "";

  let credibilityScore = 60;
  let credibilityStatus = 3;

  try {
    const { data: credibility, error } =
      await credibilityService.getUserCredibility(user.id);
    if (!error && credibility) {
      credibilityScore = credibility.score;
      credibilityStatus = credibility.level;
    }
  } catch {
    // keep defaults
  }

  res.json({
    name: data?.fullname ?? fallbackName,
    user_name: data?.user_name ?? fallbackName,
    first_name: data?.first_name ?? meta.firstName ?? "",
    middle_name: data?.middle_name ?? meta.middleName ?? "",
    last_name: data?.last_name ?? meta.lastName ?? "",
    phone: data?.phone ?? meta.phone ?? "",
    department: data?.department ?? "",
    birthdate: data?.birthdate ?? null,
    location: data?.location ?? "",
    role: data?.role ?? "user",
    email: user.email,
    credibility_score: credibilityScore,
    credibility_status: credibilityStatus,
  });
};

export const changePassword = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;
    if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

    const { currentPassword, newPassword } = req.body ?? {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: currentPassword,
    });

    if (signInError) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const { error: updateError } = await profileService.updateAuth(user.id, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({ message: "Password updated successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProfile = async (
  req: AuthRequest,
  res: Response
) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  await profileService.ensureProfile(user.id);

  const { first_name, middle_name, last_name, user_name, phone, birthdate, location, department } =
    req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (first_name !== undefined) updates.first_name = first_name;
  if (middle_name !== undefined) updates.middle_name = middle_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (user_name !== undefined) updates.user_name = user_name;
  if (phone !== undefined) updates.phone = phone;
  if (birthdate !== undefined) updates.birthdate = birthdate;
  if (location !== undefined) updates.location = location;
  if (department !== undefined) updates.department = department;

  const { data, error } = await profileService.updateProfileFields(
    user.id,
    updates
  );

  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: "Profile updated successfully", data });
};

export const changeEmail = async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user || !req.token) return res.status(401).json({ error: "Unauthorized" });

  const { currentEmail, newEmail } = req.body ?? {};

  if (!currentEmail || !newEmail) {
    return res.status(400).json({ error: "Current and new email are required" });
  }

  if (String(currentEmail).toLowerCase() !== String(user.email).toLowerCase()) {
    return res.status(400).json({ error: "Current email does not match" });
  }

  const { error: updateError } = await profileService.updateAuth(user.id, {
    email: newEmail,
  });

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({
    message: "Email update requested. Confirm the change from your new email.",
  });
};