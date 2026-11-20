import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { processImage } from "@/lib/image";
import { s3 } from "@/lib/s3";

/** A story's picture: validated and re-encoded (lib/image.ts), a 1600px original plus a 140px square thumbnail (`<name>-t.webp`). Returns the /uploads URL of the original. */
export async function storeStoryImage(file: File): Promise<string> {
  const store = await s3();
  if (!store) throw new Error("Image uploads aren't available right now.");
  const [big, small] = [await processImage(file, { fit: { width: 1600, height: 1600 } }), await processImage(file, { still: true, fit: { width: 140, height: 140, cover: true } })];
  const d = new Date(), name = `feed/stories/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}`; // feed/stories/YYYY/MM/<id>.webp
  for (const [key, img] of [[`${name}.webp`, big], [`${name}-t.webp`, small]] as const) await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: img.data, ContentType: "image/webp" }));
  return `/uploads/${name}.webp`;
}
export async function dropStoryImage(url: string) {
  const store = await s3(), m = /^\/uploads\/(feed\/stories\/\d{4}\/\d{2}\/[\w-]+)\.webp$/.exec(url);
  if (!store || !m) return;
  for (const k of [`${m[1]}.webp`, `${m[1]}-t.webp`]) await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: k })).catch(() => {});
}
export const thumbOf = (url: string) => url.replace(/\.webp$/, "-t.webp");
