import { conn } from "../db";
import { enqueueMail, getMailCfg } from "../mail";
import { notifyUser } from "../notifications";
import { getCfg as pushCfg, notify } from "../pushover";
import { EVENTS, render, type Vars } from "./copy";
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
    const cfg = await trainingCfg(), ev = EVENTS[event];
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
    const cfg = await trainingCfg(), ev = EVENTS[event];
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
