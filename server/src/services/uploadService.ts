import { supabaseAdmin } from "../config/supabaseAdmin.js";

const BUCKET = "report-images";

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
  }
}

const sanitizeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);

export const uploadService = {
  async uploadImage(base64: string, filename: string, contentType: string) {
    if (!base64) return { error: "No image data provided" };

    await ensureBucket();

    const raw = (filename || "photo").replace(/[^\w.-]/g, "_");
    const ext = /\.(png|jpg|jpeg|webp|gif)$/i.test(raw)
      ? raw.match(/\.(\w+)$/)?.[1] ?? "jpg"
      : "jpg";
    const path = `${Date.now()}_${sanitizeName(raw).replace(/\.\w+$/, '.')}${ext}`;

    const buffer = Buffer.from(base64, "base64");

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: contentType || `image/${ext}`,
        upsert: true,
      });

    if (error) return { error: error.message };

    const publicUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data
      .publicUrl;

    return { data: { url: publicUrl }, error: null };
  },
};