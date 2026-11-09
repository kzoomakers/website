import { conn } from "./db";
import { complete } from "./ai";
import { handbookAudience, handbookListId, sendCampaign, saveCampaign, campaignAction } from "./mail";
import { DEFAULT_STYLE, type Design } from "./mail-render";
import { changesPrompt, diffVersions, summarize, type Change, type Word } from "./waiver-diff";

// Handbook updates: every save of the handbook is recorded as a before/after snapshot (one open row collects edits), staff then email the change to the
// "Request Handbook Updates" list as an ordinary campaign (so it shows under Email > Emails with its stats), optionally with the exact wording changes and an AI summary.

/** The handbook as the sections the agreement diff understands: the introduction, then every rule as "Section: Rule". */
export function toVersion(d: any) {
  const rules = (Array.isArray(d?.sections) ? d.sections : []).flatMap((s: any) => (Array.isArray(s?.items) ? s.items : []).map((x: any) => ({ heading: `${s.title ?? ""}: ${x?.title ?? ""}`, body: String(x?.text ?? "") })));
  return { sections: [{ heading: "Introduction", body: String(d?.intro ?? "") }, ...rules], closing: "" };
}
const changesOf = (r: { before: unknown; after: unknown }) => diffVersions(toVersion(r.before), toVersion(r.after));

/** Called on every handbook save. Edits pile up in one open row; editing back to what it was drops the row. */
export async function recordChange(before: unknown, after: unknown, who: string) {
  const c = await conn(), open = (await c.query("SELECT id, before FROM handbook_changes WHERE sent_at IS NULL AND skipped_at IS NULL ORDER BY id DESC LIMIT 1")).rows[0];
  if (open) {
    if (!changesOf({ before: open.before, after }).length) await c.query("DELETE FROM handbook_changes WHERE id = $1", [open.id]);
    else await c.query("UPDATE handbook_changes SET after = $2, updated_at = now(), created_by = $3 WHERE id = $1", [open.id, JSON.stringify(after), who]);
  } else if (changesOf({ before, after }).length) await c.query("INSERT INTO handbook_changes (before, after, created_by) VALUES ($1, $2, $3)", [JSON.stringify(before), JSON.stringify(after), who]);
}

/** What the admin screen shows: the open change with its diff, who would get the email, and what was sent before. */
export async function state() {
  const c = await conn();
  const open = (await c.query("SELECT id, created_by, updated_at, before, after FROM handbook_changes WHERE sent_at IS NULL AND skipped_at IS NULL ORDER BY id DESC LIMIT 1")).rows[0];
  const sent = (await c.query("SELECT id, sent_at, created_by, recipients, summary, exact, campaign_id, before, after FROM handbook_changes WHERE sent_at IS NOT NULL ORDER BY id DESC LIMIT 10")).rows;
  return {
    pending: open ? { id: open.id as number, by: open.created_by as string, at: open.updated_at as string, changes: changesOf(open) } : null,
    subscribers: await handbookAudience(),
    history: sent.map((r) => ({ id: r.id as number, at: r.sent_at as string, by: r.created_by as string, recipients: r.recipients as number, summary: r.summary as string, exact: r.exact as boolean, campaign: r.campaign_id as number | null, changes: changesOf(r) })),
  };
}

const openRow = async (id: number) => {
  const r = (await (await conn()).query("SELECT id, before, after FROM handbook_changes WHERE id = $1 AND sent_at IS NULL AND skipped_at IS NULL", [id])).rows[0];
  if (!r) throw new Error("That update was already sent or skipped. Reload the page.");
  return r as { id: number; before: unknown; after: unknown };
};

const SYSTEM = `You explain changes to a makerspace's member handbook to its members, in plain friendly words (8th-grade reading level, no jargon).
For each change write one bullet that starts with "- " and the rule name, a colon, then 1 to 3 short sentences: what is different and what it means for a member.
Use only what the text says: never invent rules, dates or amounts. If a change is just wording or a typo fix, say so in one short sentence. No intro, no outro, no markdown besides the "- " bullets.`;

/** A draft plain-language summary from the AI model chosen for "handbook-summary". The admin reads and edits it before anything is sent. */
export async function aiSummary(id: number) {
  const ch = changesOf(await openRow(id));
  return complete("handbook-summary", SYSTEM, `Here are the changes to the member handbook:\n\n${changesPrompt(ch)}`);
}

export async function skip(id: number) {
  await openRow(id);
  await (await conn()).query("UPDATE handbook_changes SET skipped_at = now() WHERE id = $1", [id]);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** The model's "- " bullets (or plain paragraphs) as safe HTML. */
export function summaryHtml(t: string) {
  const out: string[] = [];
  for (const block of t.trim().split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => l.startsWith("- "))) out.push(`<ul>${lines.map((l) => `<li>${esc(l.slice(2))}</li>`).join("")}</ul>`);
    else if (lines.length) out.push(`<p style="margin:0 0 14px">${lines.map(esc).join("<br>")}</p>`);
  }
  return out.join("");
}

/** Words with long unchanged stretches shortened to a little context either side, so the email shows what changed and not the whole rule. */
function wordsHtml(words: Word[]) {
  const out: string[] = [], N = 12;
  for (let i = 0; i < words.length;) {
    let j = i;
    while (j < words.length && words[j].t === words[i].t) j++;
    const text = words.slice(i, j).map((w) => w.s).join("");
    if (words[i].t === "+") out.push(`<strong>${esc(text)}</strong>`);
    else if (words[i].t === "-") out.push(`<s>${esc(text)}</s>`);
    else {
      const toks = words.slice(i, j).map((w) => w.s);
      out.push(esc(toks.length > N * 2 + 8 ? `${i === 0 ? "" : toks.slice(0, N).join("")}… ${j === words.length ? "" : toks.slice(-N).join("")}` : text));
    }
    i = j;
  }
  return out.join("");
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);
/** The update email: a headline, the optional summary, the optional exact changes (new wording bold, removed struck through), and a link to the handbook. */
export function updateDesign(ch: Change[], summary: string, exact: boolean): Design {
  const blocks: Design["blocks"] = [
    { t: "heading", text: "The member handbook was updated", align: "left" },
    { t: "text", html: `<p style="margin:0 0 14px">Hi {{name}}, you asked us to tell you when the handbook changes. ${esc(summarize(ch))}</p>`, align: "left" },
  ];
  if (summary.trim()) blocks.push({ t: "heading", text: "What changed", align: "left" }, { t: "text", html: summaryHtml(summary), align: "left" });
  if (exact) {
    blocks.push({ t: "heading", text: "The exact changes", align: "left" }, { t: "text", html: `<p style="margin:0 0 14px;color:#666">New wording is <strong>bold</strong>; removed wording is <s>struck through</s>.</p>`, align: "left" });
    for (const c of ch.slice(0, 40)) blocks.push({ t: "text", html: `<p style="margin:0 0 6px"><strong>${esc(c.heading)}</strong> <em>(${c.kind === "added" ? "new" : c.kind === "removed" ? "removed" : "edited"})</em></p><p style="margin:0 0 14px">${c.words ? wordsHtml(c.words) : esc(clip(c.body ?? "", 1500))}</p>`, align: "left" });
    if (ch.length > 40) blocks.push({ t: "text", html: `<p>…and ${ch.length - 40} more. See the handbook for everything.</p>`, align: "left" });
  }
  blocks.push({ t: "button", label: "Read the handbook", href: "/handbook", color: "" }, { t: "footer", text: "You're receiving this because you asked to be told when the member handbook changes." });
  return { ...DEFAULT_STYLE, blocks };
}

/** Emails the change to the list as a campaign and marks the row sent. Claims the row first so two clicks can't send twice. */
export async function send(id: number, o: { summary?: string; exact?: boolean }, who: string, base: string) {
  const c = await conn(), row = await openRow(id), ch = changesOf(row), summary = String(o.summary ?? "").trim().slice(0, 3000), exact = !!o.exact;
  if (!ch.length) throw new Error("Nothing has changed, so there is nothing to send.");
  const n = await handbookAudience();
  if (!n) throw new Error("Nobody has asked for handbook updates yet.");
  if (!(await c.query("UPDATE handbook_changes SET sent_at = now() WHERE id = $1 AND sent_at IS NULL AND skipped_at IS NULL RETURNING id", [id])).rowCount) throw new Error("That update was already sent or skipped. Reload the page.");
  let camp = 0;
  try {
    camp = await saveCampaign({ name: `Handbook update ${new Date().toISOString().slice(0, 10)}`, subject: "The Kzoo Makers handbook was updated", preview: clip(summarize(ch), 150), design: updateDesign(ch, summary, exact), list_ids: [await handbookListId()] });
    await sendCampaign(camp, base);
  } catch (e) {
    await c.query("UPDATE handbook_changes SET sent_at = NULL WHERE id = $1", [id]);
    if (camp) await campaignAction(camp, "trash").catch(() => {});
    throw e;
  }
  await c.query("UPDATE handbook_changes SET campaign_id = $2, recipients = $3, summary = $4, exact = $5 WHERE id = $1", [id, camp, n, summary, exact]);
  return n;
}
