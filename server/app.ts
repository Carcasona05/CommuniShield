import "dotenv/config";
import app from "./api/index.js";
import { commentSentimentJobs } from "./src/services/commentSentimentJobs.js";
import { adminAnalysisJobs } from "./src/services/adminAnalysisJobs.js";

const PORT = Number(process.env.PORT || 3000);

// Render requires binding to all interfaces and its supplied PORT.
// Reuse the Vercel app so routes and middleware stay identical on both hosts.
app.listen(PORT, "0.0.0.0", () => {
    console.log("Server is running on port", PORT);
});

let commentWorkerBusy = false;
const recoverComments = async () => {
    if (commentWorkerBusy) return;
    commentWorkerBusy = true;
    try { await commentSentimentJobs.drain(5); }
    catch (error) { console.error("Comment worker failed:", error); }
    finally { commentWorkerBusy = false; }
};
void recoverComments();
setInterval(recoverComments, 15000).unref();

let analysisWorkerBusy = false;
const recoverAnalysis = async () => {
    if (analysisWorkerBusy) return;
    analysisWorkerBusy = true;
    try { await Promise.all([adminAnalysisJobs.drain(1), adminAnalysisJobs.drain(1)]); }
    catch (error) { console.error("Admin analysis worker failed:", error); }
    finally { analysisWorkerBusy = false; }
};
void recoverAnalysis();
setInterval(recoverAnalysis, 5000).unref();
