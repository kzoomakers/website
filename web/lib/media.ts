import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { conn, db } from "./db";
import { s3 } from "./s3";

export type Media = { id: number; key: string; filename: string; mime: string; size: number; alt: string; uploader: string; created_at: string };


export const listMedia = async (): Promise<Media[]> => (db() ? (await (await conn()).query("SELECT * FROM media ORDER BY id DESC LIMIT 500")).rows : []);

export const registerMedia = async (key: string, filename: string, mime: string, size: number, who: string) =>
  void (await (await conn()).query("INSERT INTO media (key, filename, mime, size, uploader) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [key, filename.slice(0, 200), mime, size, who]));

export const setAlt = async (id: number, alt: string) => void (await (await conn()).query("UPDATE media SET alt = $2 WHERE id = $1", [id, alt.slice(0, 300)]));

/** Removes the file from storage and the library. Pages that still point at it will show a broken image. */
export async function deleteMedia(id: number) {
  const c = await conn(), store = await s3();
  const r = await c.query("DELETE FROM media WHERE id = $1 RETURNING key", [id]);
  if (r.rows[0] && store) await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: r.rows[0].key }));
}
