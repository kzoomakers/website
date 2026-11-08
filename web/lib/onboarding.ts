import sharp from "sharp";
import { db } from "./db";
import { logAudit } from "./store";
import { open, seal } from "./vault";
import { signWaiver, type Proof } from "./sign";
import { STEP_SQL, latestVersion } from "./waiver";

// After staff approve someone, their next sign-in walks them through: waiver (signed PDF emailed) -> handbook -> photo ID. Order is enforced here, not just in the UI.
export const OFFICE = "contact@kzoomakers.org";
export const ID_KINDS = { license: "Driver's license or state ID", passport: "Passport", military: "Military ID", college: "College ID" } as const;
export type IdKind = keyof typeof ID_KINDS;
export type Step = "waiver" | "handbook" | "id" | "done" | "resign" | "profile"; // resign = already a member, but a newer mandatory agreement needs signing
const NEXT: Record<Step, Step> = { waiver: "handbook", handbook: "id", id: "done", done: "done", resign: "done", profile: "done" };

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

export async function getStep(userId: number): Promise<Step> {
  return ((await (await conn()).query(`SELECT ${STEP_SQL} AS step FROM site_users u WHERE u.id = $1`, [userId])).rows[0]?.step ?? "done") as Step;
}

/** Moves forward exactly one step, and only from `from` (so a replayed or skipped request changes nothing). */
async function advance(userId: number, from: Step) {
  if (!(await (await conn()).query("UPDATE site_users SET onboarding = $3 WHERE id = $1 AND onboarding = $2", [userId, from, NEXT[from]])).rowCount) throw new Error("That step isn't the one you're on. Reload the page.");
}

export async function sign(u: { id: number; name: string; email: string }, signature: string, initials: string, drawn: string, proof: Proof, base: string) {
  const step = await getStep(u.id);
  if (step !== "waiver" && step !== "resign") throw new Error("You've already signed the current agreement.");
  await signWaiver(u, await latestVersion(), signature, initials, drawn, proof, base, OFFICE);
  if (step === "waiver") await advance(u.id, "waiver"); // a re-sign has nothing to advance: the new signature is what clears it
}

export async function handbookRead(userId: number) { await advance(userId, "handbook"); }

/** The rules for an ID upload; throws a message the member can act on. */
export function checkId(kind: string, expires: string, size: number, now = Date.now()) {
  if (!(kind in ID_KINDS)) throw new Error("Choose the kind of ID.");
  const exp = expires ? new Date(expires + "T23:59:59") : null;
  if (exp && isNaN(+exp)) throw new Error("That expiration date doesn't look right.");
  if (kind !== "college" && !exp) throw new Error("Enter the expiration date printed on your ID.");
  if (exp && +exp < now) throw new Error("That ID is expired. Please use one that hasn't expired.");
  if (size > 12 * 1024 * 1024) throw new Error("That image is too large (12MB max).");
}

const MAX_PIXELS = 50e6; // decoding is in memory on the one server process; a phone's 48MP photo fits, a decompression bomb doesn't

export async function storeId(userId: number, kind: string, expires: string, file: File) {
  if ((await getStep(userId)) !== "id") throw new Error("Finish the earlier steps first.");
  checkId(kind, expires, file.size);
  // Re-encoding drops metadata (GPS and the like) and proves it is a real image.
  const raw = Buffer.from(await file.arrayBuffer());
  const m = await sharp(raw).metadata().catch(() => null); // reads the header only, HEIC included
  if (m && (m.width ?? 0) * (m.height ?? 0) > MAX_PIXELS) throw new Error("That photo has too many pixels. Use a lower-resolution setting, or take a screenshot of it.");
  const toJpg = (b: Buffer) => sharp(b).rotate().resize(2200, 2200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  // sharp's build can't read iPhone HEIC photos, so those are converted to JPEG first.
  const jpg = await toJpg(raw).catch(async () => toJpg(Buffer.from(await (await import("heic-convert")).default({ buffer: raw, format: "JPEG", quality: 0.9 })))).catch(() => { throw new Error("That image couldn't be read. Upload a JPG, PNG, WebP or HEIC photo or scan."); });
  await (await conn()).query("INSERT INTO member_ids (user_id, kind, expires_on, data) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET kind = EXCLUDED.kind, expires_on = EXCLUDED.expires_on, data = EXCLUDED.data, uploaded_at = now()", [userId, kind, expires || null, seal(jpg)]);
  await advance(userId, "id");
}

/** Staff viewing someone's ID: decrypts, and is always recorded in the audit log. */
export async function viewId(userId: number, who: string) {
  const r = (await (await conn()).query("SELECT i.data, u.email FROM member_ids i JOIN site_users u ON u.id = i.user_id WHERE i.user_id = $1", [userId])).rows[0];
  if (!r) return null;
  await logAudit(who, "crm.id.view", r.email);
  return open(r.data);
}
