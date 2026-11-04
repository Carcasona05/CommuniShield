import "dotenv/config";
import app from "./api/index.js";

const PORT = Number(process.env.PORT || 3000);

// Render requires binding to all interfaces and its supplied PORT.
// Reuse the Vercel app so routes and middleware stay identical on both hosts.
app.listen(PORT, "0.0.0.0", () => {
    console.log("Server is running on port", PORT);
});