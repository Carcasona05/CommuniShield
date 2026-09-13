import type { Request, Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import crypto from "crypto";

const OTP_EXPIRY_MINUTES = 10;
const TOKEN_EXPIRY_MINUTES = 15;

const generateOtp = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

const generateToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body ?? {};

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanRole = String(role || "user").trim();

    const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = userData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (!authUser) {
      if (cleanRole === "admin" || cleanRole === "super_admin") {
        return res.status(404).json({ error: "No admin account found with this email." });
      }
      return res.status(404).json({ error: "No user account found with this email." });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authUser.id)
      .single();

    if (cleanRole === "admin" || cleanRole === "super_admin") {
      if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        return res.status(403).json({ error: "No admin account found with this email." });
      }
    } else if (profile && profile.role !== "user") {
      return res.status(403).json({ error: "No user account found with this email." });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await supabaseAdmin.from("password_resets").insert({
      email: cleanEmail,
      otp_code: otp,
      expires_at: expiresAt.toISOString(),
      used: false,
    });

    res.json({
      message: "OTP generated successfully.",
      otp,
    });
  } catch (err) {
    console.error("forgotPassword error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body ?? {};

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const { data: record, error: fetchError } = await supabaseAdmin
      .from("password_resets")
      .select("id, otp_code, expires_at, used")
      .eq("email", cleanEmail)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !record) {
      return res.status(400).json({ error: "No pending reset found. Request a new OTP." });
    }

    if (record.used) {
      return res.status(400).json({ error: "This OTP has already been used." });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: "OTP has expired. Request a new one." });
    }

    if (record.otp_code !== cleanOtp) {
      return res.status(400).json({ error: "Incorrect OTP code." });
    }

    const resetToken = generateToken();
    const tokenExpires = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await supabaseAdmin
      .from("password_resets")
      .update({ used: true })
      .eq("id", record.id);

    await supabaseAdmin.from("password_resets").insert({
      email: cleanEmail,
      otp_code: resetToken,
      expires_at: tokenExpires.toISOString(),
      used: false,
    });

    res.json({
      message: "OTP verified successfully.",
      reset_token: resetToken,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, reset_token, newPassword } = req.body ?? {};

    if (!email || !reset_token || !newPassword) {
      return res.status(400).json({ error: "Email, reset token, and new password are required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanToken = String(reset_token).trim();

    const { data: record, error: fetchError } = await supabaseAdmin
      .from("password_resets")
      .select("id, otp_code, expires_at, used")
      .eq("email", cleanEmail)
      .eq("otp_code", cleanToken)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !record) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: "Reset token has expired." });
    }

    const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
    const user = userData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (!user) {
      return res.status(400).json({ error: "User not found." });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    await supabaseAdmin
      .from("password_resets")
      .update({ used: true })
      .eq("id", record.id);

    res.json({ message: "Password has been reset successfully." });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
