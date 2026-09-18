import type { Request, Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { sendOtpEmail } from "../services/emailService.js";
import { getRedis } from "../config/redis.js";
import crypto from "crypto";

const OTP_EXPIRY_SECONDS = 15 * 60;

const generateOtp = (): string => {
  return crypto.randomInt(100000, 999999).toString();
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

    await getRedis().set(`otp:${cleanEmail}`, JSON.stringify({ otp, verified: false }), {
      ex: OTP_EXPIRY_SECONDS,
    });

    try {
      await sendOtpEmail(cleanEmail, otp);
    } catch (emailErr) {
      console.error("Failed to send OTP email:", emailErr);
      return res.status(500).json({ error: "Failed to send OTP email. Check SMTP configuration." });
    }

    res.json({
      message: "If an account exists with this email, an OTP has been sent.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("forgotPassword error:", message);
    res.status(500).json({ error: message || "Internal server error" });
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

    const raw = await getRedis().get<string>(`otp:${cleanEmail}`);

    if (!raw) {
      return res.status(400).json({ error: "No pending reset found. Request a new OTP." });
    }

    const entry = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (entry.verified) {
      return res.status(400).json({ error: "This OTP has already been used." });
    }

    if (entry.otp !== cleanOtp) {
      return res.status(400).json({ error: "Incorrect OTP code." });
    }

    await getRedis().set(`otp:${cleanEmail}`, JSON.stringify({ otp: entry.otp, verified: true }), {
      ex: OTP_EXPIRY_SECONDS,
    });

    res.json({ message: "OTP verified successfully." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("verifyOtp error:", message);
    res.status(500).json({ error: message || "Internal server error" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body ?? {};

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and new password are required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const raw = await getRedis().get<string>(`otp:${cleanEmail}`);

    if (!raw) {
      return res.status(400).json({ error: "OTP not verified. Please verify your OTP first." });
    }

    const entry = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (!entry.verified) {
      return res.status(400).json({ error: "OTP not verified. Please verify your OTP first." });
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

    await getRedis().del(`otp:${cleanEmail}`);

    res.json({ message: "Password has been reset successfully." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("resetPassword error:", message);
    res.status(500).json({ error: message || "Internal server error" });
  }
};
