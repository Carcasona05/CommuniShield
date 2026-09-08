import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./src/routes/authRoute.ts";
import reportRoutes from "./src/routes/reportRoute.ts";
import notificationRoutes from "./src/routes/notificationRoute.ts";
import uploadRoutes from "./src/routes/uploadRoute.ts";
import facilityRoutes from "./src/routes/facilityRoute.ts";
import settingsRoutes from "./src/routes/settingsRoute.ts";
import aiRoutes from "./src/routes/aiRoute.ts";
import { errorHandler } from "./src/middlewares/errorHandler.ts";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api", authRoutes);
app.use("/api", reportRoutes);
app.use("/api", notificationRoutes);
app.use("/api", uploadRoutes);
app.use("/api", facilityRoutes);
app.use("/api", settingsRoutes);
app.use("/api", aiRoutes);

app.get("/", (req, res) => {
    res.send("It is working");
})

app.use(errorHandler);

console.log("My port:", PORT);

app.listen(PORT, () => {
    console.log("Server is running on port", PORT)
})