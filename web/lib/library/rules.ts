import { levelFor, type Perms } from "../access";

// Pure library rules (no database): who may see which tier, slugs, tag cleaning, PDF check. Tested in tests/library-rules.test.mjs.
export const TIERS = ["public", "members", "authorized", "staff"] as const;
export const TYPES = ["manual", "safety", "sop", "spec", "form", "other"] as const;
export type Tier = (typeof TIERS)[number];
export type DocType = (typeof TYPES)[number];
/** Who is looking: `id` null = signed out; `member` = approved member; `staff` = trainer or library/admin access. */
export type Viewer = { id: number | null; member: boolean; staff: boolean };

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
/** "Table Saw Manual.PDF" -> "Table Saw Manual": the starting title for a bulk upload. */
export const titleFromFilename = (f: string) => f.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled document";
export const isPdf = (b: Uint8Array) => b.length > 8 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d; // "%PDF-"
export const cleanTags = (xs: unknown): string[] => [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x).trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean))].slice(0, 20);
/** Header-safe download name. */
export const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "document.pdf";

/** Makes a query mention its user-id parameter even when the rule doesn't need it: Postgres refuses a parameter that never appears ("could not determine data type"). */
export const useParam = (uid: string) => `(${uid}::int IS NULL OR ${uid}::int IS NOT NULL)`;

/** SQL condition over `lib_docs d` for what a viewer may see without a share token. `uid` is the placeholder holding the viewer's user id (or null).
 *  Staff see everything not deleted; everyone else sees only published documents of a tier they qualify for. The filter is inside the query so search never leaks a staff-only title. */
export function visibleSql(v: Viewer, uid: string): string {
  if (v.staff) return `d.deleted_at IS NULL AND ${useParam(uid)}`;
  const tiers = ["d.tier = 'public'"];
  if (v.member && v.id !== null) {
    tiers.push("d.tier = 'members'");
    tiers.push(`(d.tier = 'authorized' AND EXISTS (SELECT 1 FROM tool_docs td JOIN tool_auths ta ON ta.tool_id = td.tool_id WHERE td.doc_id = d.id AND ta.user_id = ${uid} AND (ta.expires_on IS NULL OR ta.expires_on >= current_date)))`);
  }
  return `d.deleted_at IS NULL AND d.status = 'published' AND ${useParam(uid)} AND (${tiers.join(" OR ")})`;
}

/** What staff views of the library look like (admin screens). */
export const STAFF_VIEW: Viewer = { id: null, member: true, staff: true };

/** Staff = anyone with a library grant (any page), or write access to Courses or Training (trainers). Read-only grants elsewhere don't open staff-only documents. */
export const isStaff = (perms: Perms) => !!levelFor(perms, "library", "*") || levelFor(perms, "learning", "*") === "write" || levelFor(perms, "training", "*") === "write";

/** SQL for "the first version everyone must have read": the newest version flagged re-read, else 1. `doc` is the lib_docs alias. */
export const rereadFrom = (doc: string) => `(SELECT coalesce(max(r.version), 1) FROM lib_versions r WHERE r.doc_id = ${doc}.id AND r.requires_reread)`;

export const SHARE_DAYS = [1, 7, 30] as const; // "never" is deliberately not offered: links are for passing a document on, a stable QR/permalink is for members
export const DEFAULT_SHARE_DAYS = 30;
export type ShareRow = { revoked_at: Date | null; expires_at: Date | null };
/** Is a share link usable right now? Revoked and expired links stop at once. */
export const shareLive = (s: ShareRow, now = new Date()) => !s.revoked_at && (!s.expires_at || s.expires_at > now);

/** SOPs and safety guides are the documents members acknowledge ("I've read version N"). */
export const needsAck = (type: string) => type === "sop" || type === "safety";
/** A review date that has passed (today still counts as on time). `today` is a yyyy-mm-dd string. */
export const reviewOverdue = (reviewOn: string | Date | null, today: string) => !!reviewOn && (typeof reviewOn === "string" ? reviewOn : reviewOn.toISOString()).slice(0, 10) < today;
