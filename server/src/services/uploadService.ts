import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { randomUUID } from "node:crypto";

const BUCKET = "report-images";

let bucketReady: Promise<void> | null = null;
async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
      if (error) throw error;
      if (!buckets?.some((b) => b.name === BUCKET)) {
        const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
        // Another server instance may have created the same bucket meanwhile.
        if (createError && !/already exists|duplicate/i.test(createError.message)) throw createError;
      }
    })().catch((error: unknown) => { bucketReady = null; throw error; });
  }
  return bucketReady;
}

const sanitizeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);

export const uploadService = {
  async uploadImage(base64: string, filename: string, contentType: string) {
    if (!base64) return { error: "No image data provided" };

    try {
      await ensureBucket();
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Image storage is unavailable" };
    }

    const raw = (filename || "photo").replace(/[^\w.-]/g, "_");
    const ext = /\.(png|jpg|jpeg|webp|gif)$/i.test(raw)
      ? raw.match(/\.(\w+)$/)?.[1] ?? "jpg"
      : "jpg";
    // Parallel uploads can have the same timestamp and original filename.
    const path = `${randomUUID()}_${sanitizeName(raw).replace(/\.\w+$/, '.')}${ext}`;

    const buffer = Buffer.from(base64, "base64");

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: contentType || `image/${ext}`,
        upsert: false,
      });

    if (error) {
      bucketReady = null;
      return { error: error.message };
    }

    const publicUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data
      .publicUrl;

    return { data: { url: publicUrl }, error: null };
  },
};
