import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { db } from "./db";
import { s3 } from "./s3";
import { judge } from "./spam";
import { cleanGuided } from "./guided";
import { getGuided, saveGuided } from "./store";

export type Review = { id: number; user_id: number; name: string; role: string; photo: string; text: string; status: "pending" | "approved" | "rejected"; reason: string; created_at: string; email: string };
export const MAX_REVIEW = 800;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Reviewer's selfie: validated, shrunk to a 240px square and stored under avatars/. Not added to the media library (like other avatars). */
async function storePhoto(file: File): Promise<string> {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("The photo must be a JPG, PNG, WebP or GIF image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The photo is too large (5MB max).");
  const store = s3();
  if (!store) throw new Error("Photo uploads aren't available right now.");
  const body = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(240, 240, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer().catch(() => { throw new Error("That image couldn't be read."); });
  const key = `avatars/${randomUUID()}.jpg`;
  await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: body, ContentType: "image/jpeg" }));
  return `/uploads/${key}`;
}
async function dropPhoto(url: string) {
  const store = s3(), key = url.replace(/^\/uploads\//, "");
  if (store && key.startsWith("avatars/")) await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key })).catch(() => {});
}

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

/** A signed-in reader submits a review. One waiting at a time; filter-caught spam is stored as rejected and looks accepted. */
export async function submitReview(user: { id: number; name: string }, textIn: string, roleIn: string, photo?: File | null) {
  const text = textIn.trim(), role = roleIn.trim().slice(0, 60);
  if (text.length < 10 || text.length > MAX_REVIEW) throw new Error(`Please write between 10 and ${MAX_REVIEW} characters.`);
  const c = await conn();
  if ((await c.query("SELECT 1 FROM review_submissions WHERE user_id = $1 AND status = 'pending'", [user.id])).rowCount) throw new Error("You already have a review waiting for approval. Thank you!");
  if ((await c.query("SELECT count(*)::int AS n FROM review_submissions WHERE user_id = $1 AND created_at > now() - interval '1 day'", [user.id])).rows[0].n >= 3) throw new Error("Too many reviews today. Please try again tomorrow.");
  const v = judge(text, { mode: "all", blocked: [], priorApproved: 0, duplicate: !!(await c.query("SELECT 1 FROM review_submissions WHERE user_id = $1 AND text = $2", [user.id, text])).rowCount });
  const url = photo && photo.size ? await storePhoto(photo) : "";
  await c.query("INSERT INTO review_submissions (user_id, name, role, photo, text, status, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)", [user.id, user.name, role, url, text, v.status === "spam" ? "rejected" : "pending", v.status === "spam" ? v.reason : ""]);
}

export async function listReviews(status: string): Promise<Review[]> {
  if (!db()) return [];
  return (await (await conn()).query("SELECT r.id, r.user_id, r.name, r.role, r.photo, r.text, r.status, r.reason, r.created_at, u.email FROM review_submissions r JOIN site_users u ON u.id = r.user_id WHERE r.status = $1 ORDER BY r.id DESC LIMIT 200", [status])).rows;
}
export async function reviewCounts(): Promise<Record<string, number>> {
  if (!db()) return {};
  return Object.fromEntries((await (await conn()).query("SELECT status, count(*)::int AS n FROM review_submissions GROUP BY status")).rows.map((r) => [r.status, r.n]));
}

/** Admin decision. `approve` saves any edits, then appends the review to the homepage roster (once). */
export async function decideReview(id: number, action: "save" | "approve" | "reject" | "restore", edit: { name?: string; role?: string; text?: string }, who: string) {
  const c = await conn();
  const r = (await c.query("SELECT * FROM review_submissions WHERE id = $1", [id])).rows[0];
  if (!r) throw new Error("No such review.");
  const name = (edit.name ?? r.name).trim().slice(0, 80), role = (edit.role ?? r.role).trim().slice(0, 60), text = (edit.text ?? r.text).trim().slice(0, MAX_REVIEW);
  if (!name || !text) throw new Error("A review needs a name and some text.");
  await c.query("UPDATE review_submissions SET name = $2, role = $3, text = $4 WHERE id = $1", [id, name, role, text]);
  if (action === "approve") {
    if (r.status === "approved") throw new Error("Already on the roster.");
    const home = await getGuided("index");
    if (!home) throw new Error("Homepage content isn't set up yet.");
    // Same entry shape the homepage editor uses; without a photo the homepage shows a letter avatar.
    home.reviews = [...home.reviews, { name, role, photo: r.photo, text }];
    await saveGuided("index", cleanGuided("index", home), who, "review.approve", `${name} (submission ${id})`);
  }
  const status = { approve: "approved", reject: "rejected", restore: "pending", save: r.status }[action];
  await c.query("UPDATE review_submissions SET status = $2, decided_at = now(), decided_by = $3 WHERE id = $1", [id, status, who]);
}
export async function deleteReview(id: number) {
  const r = (await (await conn()).query("DELETE FROM review_submissions WHERE id = $1 RETURNING photo, status", [id])).rows[0];
  // An approved review's photo is still used by the homepage roster, so only unused photos are removed.
  if (r?.photo && r.status !== "approved") await dropPhoto(r.photo);
}
