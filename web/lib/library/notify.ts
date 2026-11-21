import { conn } from "../db";
import { enqueueMail, getMailCfg } from "../mail";
import { notifyUser } from "../notifications";
import { getDoc } from "./docs";
import { needsAck, visibleSql, type Viewer } from "./rules";

// "This SOP changed" emails. Two audiences, both through the normal mail queue (so sending is batched and retried like every other message):
//  - followers: members who chose "Email me when this changes" on the document (every new version);
//  - the trained: anyone currently authorized on a tool the document is attached to, but only when the version asks for a re-read (a typo fix shouldn't email the whole shop).
// Only SOPs and safety guides, only published ones, and only people who may still see the document (so a private title never leaks). Each (document, version, person) is sent once.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const site = async () => ((await getMailCfg().catch(() => null))?.siteUrl || process.env.SITE_URL || "").replace(/\/+$/, "");

/** A member follows or stops following a document they can see. */
export async function setFollow(v: Viewer, slug: string, on: boolean) {
  const d = v.id === null ? null : await getDoc(v, slug);
  if (!d || !needsAck(d.type)) throw new Error("That document can't be followed.");
  const c = await conn();
  if (on) await c.query("INSERT INTO lib_subs (user_id, doc_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [v.id, d.id]);
  else await c.query("DELETE FROM lib_subs WHERE user_id = $1 AND doc_id = $2", [v.id, d.id]);
}
export const isFollowing = async (userId: number, docId: number) => !!(await (await conn()).query("SELECT 1 FROM lib_subs WHERE user_id = $1 AND doc_id = $2", [userId, docId])).rowCount;

/** Who a version would be emailed to: followers, plus (when `reread`) people authorized on a tool the document is attached to. `tools` names why each trained person is included. */
export async function audience(docId: number, reread: boolean) {
  const c = await conn(), live = "u.approval = 'approved' AND u.disabled_at IS NULL";
  const follow = (await c.query(`SELECT u.id FROM lib_subs s JOIN site_users u ON u.id = s.user_id WHERE s.doc_id = $1 AND ${live}`, [docId])).rows.map((r) => r.id as number);
  const trained = new Map<number, string[]>();
  if (reread) for (const r of (await c.query(`SELECT a.user_id, t.name FROM tool_docs td JOIN tool_auths_effective a ON a.tool_id = td.tool_id AND NOT a.expired JOIN tools t ON t.id = td.tool_id JOIN site_users u ON u.id = a.user_id
    WHERE td.doc_id = $1 AND t.archived_at IS NULL AND ${live} ORDER BY lower(t.name)`, [docId])).rows) trained.set(r.user_id, [...(trained.get(r.user_id) ?? []), r.name]);
  return { follow, trained };
}

/** Emails and bell-notifies the audience of a new version. Never throws (the upload has already succeeded); returns how many people were told. */
export async function notifyNewVersion(docId: number, version: number): Promise<number> {
  try {
    const c = await conn(), d = (await c.query("SELECT d.title, d.slug, d.type, d.status, v.change_note, v.requires_reread FROM lib_docs d JOIN lib_versions v ON v.doc_id = d.id AND v.version = $2 WHERE d.id = $1 AND d.deleted_at IS NULL", [docId, version])).rows[0];
    if (!d || d.status !== "published" || !needsAck(d.type)) return 0;
    const { follow, trained } = await audience(docId, d.requires_reread), ids = [...new Set([...follow, ...trained.keys()])], base = await site(), link = `${base}/members/library/${d.slug}`;
    // One query keeps only people who may still see the document; one more claims this version's send-markers (a marker already there means they were told).
    const who = (await c.query(`SELECT u.id, u.email, u.name, u.first_name FROM site_users u WHERE u.id = ANY($1) AND EXISTS (SELECT 1 FROM lib_docs d WHERE d.id = $2 AND ${visibleSql({ id: 0, member: true, staff: false }, "u.id")})`, [ids, docId])).rows;
    const fresh = new Set((await c.query("INSERT INTO training_mail_log (key) SELECT 'lib:' || $1::text || ':' || $2::text || ':' || x FROM unnest($3::int[]) AS x ON CONFLICT DO NOTHING RETURNING key", [docId, version, who.map((u) => u.id)])).rows.map((r) => r.key as string));
    let sent = 0;
    for (const u of who) {
      const key = `lib:${docId}:${version}:${u.id}`;
      if (!fresh.has(key)) continue;
      try { // one person's failure never stops the rest, and frees their marker so a later try can still reach them
        const tools = trained.get(u.id), why = tools ? `You're authorized on ${tools.join(", ")}, and this document is part of that tool's training.` : "You asked to be emailed when this document changes.";
        const ask = d.requires_reread ? "Please read the new version and confirm it on the page." : "No need to read it again unless you want to.";
        const note = d.change_note ? `What changed: ${d.change_note}` : "", subject = `${d.requires_reread ? "Please re-read" : "Updated"}: ${d.title}`;
        const text = [`Hi ${u.first_name || u.name},`, `${d.title} has a new version (version ${version}).`, note, ask, `Open it: ${link}`, why, tools ? "" : "To stop these emails, open the document and turn off \"Email me when this changes\"."].filter(Boolean).join("\n\n");
        const html = `<div style="font-family:sans-serif;font-size:16px;line-height:1.5"><p>Hi ${esc(u.first_name || u.name)},</p><p><b>${esc(d.title)}</b> has a new version (version ${version}).</p>${note ? `<p>${esc(note)}</p>` : ""}<p>${ask}</p><p><a href="${esc(link)}">Open the document</a></p><p style="color:#666">${esc(why)}${tools ? "" : " To stop these emails, open the document and turn off “Email me when this changes”."}</p></div>`;
        await enqueueMail({ to: u.email, subject, text, html });
        await notifyUser(u.id, { kind: "library", title: subject, body: note.slice(0, 200), url: `/members/library/${d.slug}` }).catch(() => {}); // the email is queued; a missing bell notice must not cause a resend
        sent++;
      } catch (e) {
        console.error("sop update notice failed for one person:", String((e as Error)?.message ?? e));
        await c.query("DELETE FROM training_mail_log WHERE key = $1", [key]).catch(() => {});
      }
    }
    return sent;
  } catch (e) { console.error("sop update notice failed:", String((e as Error)?.message ?? e)); return 0; }
}
