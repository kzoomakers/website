import { createHash } from "crypto";

// The hash chain behind the PII access log: each row's hash covers the row and the hash before it, so changing, removing or reordering any row breaks every hash after it.
export const GENESIS = "genesis";
export type Row = { at: Date | string; viewer_id: number | null; viewer_email: string; viewer_is_admin: boolean; subject_type: string; subject_id: number; subject_name: string; kind: string; fields: string[]; reason: string; note: string; via: string; ip: string; ua: string; request_path: string };
/** The row as it is hashed: a fixed order of fields, so the same row always gives the same text. */
export const canon = (r: Row) => JSON.stringify([new Date(r.at).toISOString(), r.viewer_id, r.viewer_email, r.viewer_is_admin, r.subject_type, r.subject_id, r.subject_name, r.kind, r.fields, r.reason, r.note, r.via, r.ip, r.ua, r.request_path]);
export const chainHash = (prev: string, r: Row) => createHash("sha256").update(prev + "\n" + canon(r)).digest("hex");
/** Checks stored rows (in id order) continue from `prev`. Returns the id of the first row that doesn't fit, or the hash to continue from. */
export function checkRows(rows: (Row & { id: number; prev_hash: string; hash: string })[], prev = GENESIS): { bad: number } | { head: string } {
  for (const r of rows) { if (r.prev_hash !== prev || r.hash !== chainHash(prev, r)) return { bad: r.id }; prev = r.hash; }
  return { head: prev };
}
