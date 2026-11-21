import { conn } from "../db";
import { digestDue } from "../ga-digest";
import { lastFullMonth, REPORT_TO } from "../pii-months";
import { enqueueMail, getMailCfg } from "../mail";
import { notifyUser } from "../notifications";
import { getCfg as pushCfg, notify } from "../pushover";
import { EVENTS, esc, render, type Vars } from "./copy";
import { trainingCfg } from "./settings";

// One place that says "this happened" and fans it out: an email through the mail queue and a bell notice for the member. Called after the change has committed;
// a failing channel is logged and never undoes anything. Each (event, member, ref, day) is sent once.
const log = (e: unknown) => console.error("training notice failed:", String((e as Error)?.message ?? e));
const site = async () => ((await getMailCfg().catch(() => null))?.siteUrl || process.env.SITE_URL || "").replace(/\/+$/, "");

/** Forgets a sent-marker when the send itself failed, so the next try isn't mistaken for a repeat. */
const unmark = (key: string) => key ? conn().then((c) => c.query("DELETE FROM training_mail_log WHERE key = $1", [key])).catch(log) : undefined;

export async function emit(event: keyof typeof EVENTS & string, o: { userId: number; ref: string | number; vars?: Vars; replyTo?: string }) {
  let key = "";
  try {
    const cfg = await trainingCfg(), ev = Object.hasOwn(EVENTS, event) ? EVENTS[event] : undefined;
    if (!ev || !cfg.enabled || cfg.events[event] === false) return;
    const c = await conn(), u = (await c.query("SELECT email, name, first_name FROM site_users WHERE id = $1", [o.userId])).rows[0];
    if (!u) return;
    const k = `${event}:${o.userId}:${o.ref}:${new Date().toISOString().slice(0, 10)}`;
    if (!(await c.query("INSERT INTO training_mail_log (key) VALUES ($1) ON CONFLICT DO NOTHING", [k])).rowCount) return; // already sent today
    key = k;
    const link = `${await site()}/members/training`, tpl = { ...ev, ...(cfg.copy[event] ?? {}) };
    const m = render(tpl, { name: u.first_name || u.name, link, ...o.vars });
    const reply = /^[^\s@]+@[^\s@]+$/.test(cfg.reply_to) ? cfg.reply_to : o.replyTo;
    await enqueueMail({ to: u.email, subject: m.subject, text: m.text, html: `<div style="font-family:sans-serif;font-size:16px;line-height:1.5">${m.html}</div>`, ...(reply ? { headers: { "Reply-To": reply } } : {}) } as any);
    await notifyUser(o.userId, { kind: "training", title: m.subject, body: m.text.split("\n\n")[1]?.slice(0, 200) ?? "", url: "/members/training" }).catch(log); // the email is queued by now: a missing bell notice must not make a retry send it twice
  } catch (e) { log(e); await unmark(key); }
}

/** Notice to the training leads (people on the "override" special permission). With nobody on that list, none is sent: the audit log still has it. */
export async function emitLeads(event: keyof typeof EVENTS & string, ref: string | number, vars: Vars) {
  let key = "";
  try {
    const cfg = await trainingCfg(), ev = Object.hasOwn(EVENTS, event) ? EVENTS[event] : undefined;
    if (!ev || !cfg.enabled || cfg.events[event] === false) return;
    const c = await conn(), k = `${event}:lead:${ref}`;
    if (!(await c.query("INSERT INTO training_mail_log (key) VALUES ($1) ON CONFLICT DO NOTHING", [k])).rowCount) return;
    key = k;
    const m = render({ ...ev, ...(cfg.copy[event] ?? {}) }, vars);
    for (const r of (await c.query("SELECT email FROM special_perms WHERE perm = 'training.override'")).rows) await enqueueMail({ to: r.email, subject: m.subject, text: m.text, html: m.html } as any);
  } catch (e) { log(e); await unmark(key); }
}

/** Staff push for passes nobody has been told about: one message for however many arrived, run every 15 minutes. Passes are marked only once the push really went out. */
export async function pushWaiting() {
  if (!(await trainingCfg()).enabled) return 0;
  const p = await pushCfg();
  if (!p.token || !p.groups.training) return 0; // not set up yet: keep them waiting rather than call them announced
  const c = await conn(), ids = (await c.query("SELECT id FROM certifications WHERE state = 'passed' AND pushed_at IS NULL")).rows.map((r) => r.id);
  if (!ids.length) return 0;
  await notify("training", { title: "Training", message: `${ids.length} ${ids.length === 1 ? "person is" : "people are"} ready for sign-off.`, click: `${await site()}/admin/people/training` }, "training");
  await c.query("UPDATE certifications SET pushed_at = now() WHERE id = ANY($1)", [ids]);
  return ids.length;
}

/** Monday-morning email to each trainer: who is waiting on their tools and for how long. Hourly job; the sent-marker makes it once per trainer per Monday, and nothing is sent when nobody waits or the trainer opted out. */
export async function trainerDigest(now = new Date()) {
  const day = digestDue("", now);
  if (!day || !(await trainingCfg()).enabled) return 0;
  const c = await conn(), link = `${await site()}/admin/people/training`;
  const rows = (await c.query(`SELECT tr.user_id, u.email, t.name AS tool, count(*)::int AS n, max(floor(extract(epoch FROM now() - ce.created_at) / 86400))::int AS oldest
    FROM certifications ce JOIN tool_trainers tr ON tr.tool_id = ce.tool_id JOIN site_users u ON u.id = tr.user_id AND u.trainer_digest AND u.disabled_at IS NULL JOIN tools t ON t.id = ce.tool_id
    WHERE ce.state IN ('passed','in_training','ready') GROUP BY tr.user_id, u.email, t.name ORDER BY t.name`)).rows;
  const by = new Map<number, typeof rows>();
  for (const r of rows) by.set(r.user_id, [...(by.get(r.user_id) ?? []), r]);
  let sent = 0;
  for (const [id, rs] of by) {
    try {
      if (!(await c.query("INSERT INTO training_mail_log (key) VALUES ($1) ON CONFLICT DO NOTHING", [`digest:${id}:${day}`])).rowCount) continue;
      const lines = rs.map((r) => `${r.tool}: ${r.n} waiting, the longest ${r.oldest} day${r.oldest === 1 ? "" : "s"}`), total = rs.reduce((a, r) => a + r.n, 0);
      const text = `${lines.join("\n")}\n\nOpen the queue: ${link}\n\nDon't want this email? Turn it off on the Tool authorizations page (${link.replace("/admin/people/training", "/members/training")}).`;
      await enqueueMail({ to: rs[0].email, subject: `Training: ${total} waiting on you`, text, html: `<div style="font-family:sans-serif;font-size:16px;line-height:1.5">${lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("")}<p><a href="${esc(link)}">Open the queue</a></p><p style="color:#666;font-size:14px">Don't want this email? Turn it off on the <a href="${esc(link.replace("/admin/people/training", "/members/training"))}">Tool authorizations page</a>.</p></div>` } as any);
      sent++;
    } catch (e) { log(e); await unmark(`digest:${id}:${day}`); }
  }
  return sent;
}

/** Once a month (the hourly job checks): every override of the month before, to the board, as the plan asks. Nothing is sent for a month with none; the sent-marker makes it once. */
export async function boardOverrides(now = new Date()) {
  const month = lastFullMonth(now, "America/Detroit"), k = `board-overrides:${month}`;
  if (!(await trainingCfg()).enabled) return false;
  const c = await conn();
  const rows = (await c.query(`SELECT e.at, e.actor, e.data->>'how' AS how, u.name AS member, tl.name AS tool, e.note FROM cert_events e JOIN certifications ce ON ce.id = e.cert_id JOIN site_users u ON u.id = ce.user_id JOIN tools tl ON tl.id = ce.tool_id
    WHERE e.kind = 'override' AND to_char(e.at AT TIME ZONE 'America/Detroit', 'YYYY-MM') = $1 ORDER BY e.at`, [month])).rows;
  if (!(await c.query("INSERT INTO training_mail_log (key) VALUES ($1) ON CONFLICT DO NOTHING", [k])).rowCount || !rows.length) return false;
  try {
    const when = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Detroit" });
    const lines = rows.map((r) => `${when(r.at)}: ${r.actor} used "${r.how}" for ${r.member} on ${r.tool}. Reason: ${r.note}`);
    await enqueueMail({ to: REPORT_TO, subject: `Training overrides: ${month} (${rows.length})`, text: `${lines.join("\n\n")}\n\nFull list: ${await site()}/admin/people/training/reports`, html: `<div style="font-family:sans-serif"><h3>Training overrides: ${esc(month)}</h3>${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>` } as any);
    return true;
  } catch (e) { log(e); await unmark(k); return false; }
}
