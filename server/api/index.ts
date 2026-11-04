import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import authRoutes from "../src/routes/authRoute.js";
import reportRoutes from "../src/routes/reportRoute.js";
import notificationRoutes from "../src/routes/notificationRoute.js";
import uploadRoutes from "../src/routes/uploadRoute.js";
import facilityRoutes from "../src/routes/facilityRoute.js";
import settingsRoutes from "../src/routes/settingsRoute.js";
import aiRoutes from "../src/routes/aiRoute.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api", authRoutes);
app.use("/api", reportRoutes);
app.use("/api", notificationRoutes);
app.use("/api", uploadRoutes);
app.use("/api", facilityRoutes);
app.use("/api", settingsRoutes);
app.use("/api", aiRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("It is working");
});

app.use(errorHandler);

export default app;