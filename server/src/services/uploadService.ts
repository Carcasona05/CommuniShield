import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

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
    let buffer: Buffer;
    let format: string;
    try {
      // Do not silently store a data URI, object URL or error page as image
      // bytes. Such uploads otherwise succeed but render as empty gray tiles.
      if (!/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(base64)) throw new Error("Invalid encoding");
      buffer = Buffer.from(base64, "base64");
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height || !["jpeg", "png", "webp", "gif"].includes(metadata.format || "")) throw new Error("Invalid image");
      format = metadata.format!;
    } catch {
      return { error: "The uploaded photo is not a readable image. Please select it again." };
    }

    try {
      await ensureBucket();
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Image storage is unavailable" };
    }

    const raw = (filename || "photo").replace(/[^\w.-]/g, "_");
    const ext = format === "jpeg" ? "jpg" : format;
    // Parallel uploads can have the same timestamp and original filename.
    const path = `${randomUUID()}_${sanitizeName(raw).replace(/\.\w+$/, '.')}${ext}`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: `image/${format}`,
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
