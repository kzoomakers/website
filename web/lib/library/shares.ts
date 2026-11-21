import { createHash, randomBytes } from "node:crypto";
import { conn } from "../db";
import { checkPw, hashPw } from "../sign-access";
import { DEFAULT_SHARE_DAYS, SHARE_DAYS, shareLive } from "./rules";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
/** What the unlock cookie holds: derived from secrets only the server has (the passcode hash), so it can't be forged and dies when the link is revoked or replaced. */
export const unlockValue = (s: { token_hash: string; passcode_hash: string }) => createHash("sha256").update(s.passcode_hash + ":" + s.token_hash).digest("hex");

/** New link for a document. The passcode is required (random if the caller gives none); the token and passcode are returned once and only hashes are stored. */
export async function createShare(docId: number, o: { days?: unknown; allowDownload?: unknown; passcode?: unknown }, who: string) {
  const days = SHARE_DAYS.includes(o.days as any) ? (o.days as number) : DEFAULT_SHARE_DAYS;
  const passcode = typeof o.passcode === "string" && o.passcode.trim().length >= 4 ? o.passcode.trim().slice(0, 64) : randomBytes(4).toString("hex");
  const token = randomBytes(16).toString("hex"), c = await conn();
  if (!(await c.query("SELECT 1 FROM lib_docs WHERE id = $1 AND deleted_at IS NULL", [docId])).rowCount) throw new Error("That document doesn't exist.");
  await c.query("INSERT INTO lib_shares (doc_id, token_hash, allow_download, expires_at, passcode_hash, created_by) VALUES ($1, $2, $3, now() + make_interval(days => $4), $5, $6)", [docId, hashToken(token), o.allowDownload === true, days, hashPw(passcode), who]);
  return { token, passcode, days };
}
export const revokeShare = async (id: number) => { await (await conn()).query("UPDATE lib_shares SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [id]); };
export const sharesFor = async (docId?: number) => (await (await conn()).query("SELECT s.id, s.doc_id, d.title, s.allow_download, s.expires_at, s.revoked_at, s.created_by, s.created_at, s.opens, s.last_open FROM lib_shares s JOIN lib_docs d ON d.id = s.doc_id WHERE $1::int IS NULL OR s.doc_id = $1 ORDER BY s.created_at DESC LIMIT 200", [docId ?? null])).rows;

/** The live share and its document for a token, or null: unknown, revoked, expired and deleted all look the same. */
export async function shareByToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const r = (await (await conn()).query(`SELECT s.id, s.token_hash, s.passcode_hash, s.allow_download, s.expires_at, s.revoked_at, d.id AS doc_id, d.title, d.tier, d.current_version, v.s3_key, v.filename, v.pages
    FROM lib_shares s JOIN lib_docs d ON d.id = s.doc_id AND d.deleted_at IS NULL JOIN lib_versions v ON v.doc_id = d.id AND v.version = d.current_version WHERE s.token_hash = $1`, [hashToken(token)])).rows[0];
  return r && shareLive(r) ? r : null;
}
export const passcodeOk = (s: { passcode_hash: string }, given: string) => { try { return checkPw(given.trim(), s.passcode_hash); } catch { return false; } };
export const countOpen = async (id: number) => { await (await conn()).query("UPDATE lib_shares SET opens = opens + 1, last_open = now() WHERE id = $1", [id]); };
