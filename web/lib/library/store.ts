import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../s3";

/** Writes a PDF (and its thumbnail, if there is one) under `dir`. Returns the keys. Names are random or fixed by us, never taken from the upload. */
export async function putPdf(dir: string, name: string, bytes: Buffer, thumbB64: string): Promise<{ key: string; thumb: string | null }> {
  const st = await s3();
  if (!st) throw new Error("File storage isn't set up.");
  const key = `${dir}/${name}.pdf`, thumb = thumbB64 ? `${dir}/${name}.webp` : null;
  await st.client.send(new PutObjectCommand({ Bucket: st.bucket, Key: key, Body: bytes, ContentType: "application/pdf" }));
  if (thumb) await st.client.send(new PutObjectCommand({ Bucket: st.bucket, Key: thumb, Body: Buffer.from(thumbB64, "base64"), ContentType: "image/webp" }));
  return { key, thumb };
}

/** Deletes stored files. Returns false if any could not be deleted (the caller keeps its record so the files can be found again). */
export async function dropKeys(keys: (string | null)[]): Promise<boolean> {
  const st = await s3(), real = keys.filter((k): k is string => !!k);
  if (!real.length) return true;
  if (!st) return false;
  let ok = true;
  for (const k of real) await st.client.send(new DeleteObjectCommand({ Bucket: st.bucket, Key: k })).catch(() => { ok = false; });
  return ok;
}

/** The bytes of a stored file, or null. Callers must already have checked who may see it. */
export async function fileBytes(key: string): Promise<Uint8Array | null> {
  const st = await s3();
  if (!st) return null;
  const r = await st.client.send(new GetObjectCommand({ Bucket: st.bucket, Key: key })).catch(() => null);
  return r?.Body ? r.Body.transformToByteArray() : null;
}
