import { conn } from "../db";
import { getDoc } from "./docs";
import { needsAck, rereadFrom, type Viewer } from "./rules";

/** Records that a member read the current version. Only for documents they may see and only for SOP/safety types; repeating it changes nothing. */
export async function acknowledge(v: Viewer, slug: string) {
  const d = v.id === null ? null : await getDoc(v, slug);
  if (!d || !needsAck(d.type)) throw new Error("That document doesn't need acknowledging.");
  await (await conn()).query("INSERT INTO lib_acks (user_id, doc_id, version) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [v.id, d.id, d.current_version]);
}
export async function ackState(userId: number, docId: number) {
  return (await (await conn()).query("SELECT version, at FROM lib_acks WHERE user_id = $1 AND doc_id = $2 ORDER BY version DESC LIMIT 1", [userId, docId])).rows[0] as { version: number; at: Date } | undefined;
}

/** Who has and hasn't read the current version of a document. "Should have read" = approved members who can see it (authorized tier: those authorized on a linked tool; staff tier: nobody). Every member is listed: no cut-off. */
export async function ackReport(docId: number) {
  const c = await conn(), d = (await c.query(`SELECT tier, current_version, ${rereadFrom("lib_docs")} AS reread_from FROM lib_docs WHERE id = $1`, [docId])).rows[0];
  if (!d) throw new Error("That document doesn't exist.");
  const who = d.tier === "staff" ? "false" : d.tier === "authorized" ? "EXISTS (SELECT 1 FROM tool_docs td JOIN tool_auths ta ON ta.tool_id = td.tool_id WHERE td.doc_id = $1 AND ta.user_id = u.id AND (ta.expires_on IS NULL OR ta.expires_on >= current_date))" : "true";
  const r = await c.query(`SELECT u.id, u.name, (SELECT max(a.at) FROM lib_acks a WHERE a.user_id = u.id AND a.doc_id = $1 AND a.version >= $2) AS at FROM site_users u WHERE u.approval = 'approved' AND u.disabled_at IS NULL AND ${who} ORDER BY lower(u.name)`, [docId, d.reread_from]);
  return { version: d.current_version, read: r.rows.filter((x) => x.at).map((x) => ({ name: x.name, at: x.at })), unread: r.rows.filter((x) => !x.at).map((x) => x.name) };
}
