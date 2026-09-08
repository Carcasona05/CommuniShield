import express from "express";
import { login, register, getProfile, updateProfile, changePassword, changeEmail, adminLogin, adminRegister } from "../controllers/authController.js";
import { getAccounts, updateAccount, deleteAccount, toggleStatus } from "../controllers/adminController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { adapt } from "../utils/adapt.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/profile", authenticate, adapt(getProfile));
router.put("/profile", authenticate, adapt(updateProfile));
router.put("/profile/email", authenticate, adapt(changeEmail));
router.put("/profile/password", authenticate, adapt(changePassword));

router.post("/admin/login", adminLogin);
router.post("/admin/register", authenticate, adapt(adminRegister));
router.get("/admin/accounts", authenticate, adapt(getAccounts));
router.put("/admin/accounts/:id", authenticate, adapt(updateAccount));
router.delete("/admin/accounts/:id", authenticate, adapt(deleteAccount));
router.patch("/admin/accounts/:id/status", authenticate, adapt(toggleStatus));

export default router;