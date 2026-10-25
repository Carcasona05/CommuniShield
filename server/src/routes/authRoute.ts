import express from "express";
import { login, register, getSession, getProfile, updateProfile, changePassword, changeEmail, adminLogin, adminRegister, getTermsStatus, recordTermsAcceptance, verifyLoginCode } from "../controllers/authController.js";
import { getAccounts, updateAccount, deleteAccount, toggleStatus } from "../controllers/adminController.js";
import { forgotPassword, verifyOtp, resetPassword } from "../controllers/passwordResetController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { adapt } from "../utils/adapt.js";
import { getNotificationPreferences, updateNotificationPreferences } from "../controllers/notificationPreferencesController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/login/verify", verifyLoginCode);
router.get("/session", authenticate, adapt(getSession));
router.get("/profile", authenticate, adapt(getProfile));
router.get("/profile/notification-preferences", authenticate, adapt(getNotificationPreferences));
router.patch("/profile/notification-preferences", authenticate, adapt(updateNotificationPreferences));
router.put("/profile", authenticate, adapt(updateProfile));
router.put("/profile/email", authenticate, adapt(changeEmail));
router.put("/profile/password", authenticate, adapt(changePassword));

router.get("/terms/status", authenticate, adapt(getTermsStatus));
router.post("/terms/accept", authenticate, adapt(recordTermsAcceptance));

router.post("/forgot-password", adapt(forgotPassword));
router.post("/verify-otp", adapt(verifyOtp));
router.post("/reset-password", adapt(resetPassword));

router.post("/admin/login", adminLogin);
router.post("/admin/register", authenticate, adapt(adminRegister));
router.get("/admin/accounts", authenticate, adapt(getAccounts));
router.put("/admin/accounts/:id", authenticate, adapt(updateAccount));
router.delete("/admin/accounts/:id", authenticate, adapt(deleteAccount));
router.patch("/admin/accounts/:id/status", authenticate, adapt(toggleStatus));

export default router;
