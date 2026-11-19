import type { PoolClient } from "pg";
import { db, conn, withTx } from "./db";
import { me } from "./guard";
import { hit } from "./limit";
import { open } from "./vault";
import { notify } from "./pushover";
import { getMailCfg, mailReady, sendQueued } from "./mail";
import { TZ } from "./guest-rules";
import { GENESIS, chainHash, checkRows, type Row } from "./pii-chain";
import { lastFullMonth } from "./pii-months";
import { BULK_DEFAULT, PII_AUDIT_PERM, PII_KINDS, PII_PERM, PII_ROUTES, checkReason, type PiiKind, type Subject } from "./pii-shared";

// Who may see a person's personal data, and the tamper-evident record of who did. Design: docs/pii-audit-access-system.md.
// Every admin read of PII goes through retrieve() (POST /api/pii/retrieve). The values are never in a page; the log row and the read commit together, so no row = no data.
export * from "./pii-shared";

export type Viewer = { id: number | null; email: string; name: string; isAdmin: boolean };
export type Cfg = { locked: boolean; bulk: number };
export class PiiError extends Error { status: number; constructor(msg: string, status = 400) { super(msg); this.status = status; } }

// ---- the hash chain (the pure part is in pii-chain.ts)
/** Appends one row. Rows are chained one at a time (the lock), so two simultaneous views can't both claim the same predecessor. */
export async function record(c: PoolClient, r: Row) {
  await c.query("SELECT pg_advisory_xact_lock(7351930)");
  const prev = (await c.query("SELECT hash FROM pii_access ORDER BY id DESC LIMIT 1")).rows[0]?.hash ?? GENESIS;
  await c.query(`INSERT INTO pii_access (at, viewer_id, viewer_email, viewer_is_admin, subject_type, subject_id, subject_name, kind, fields, reason, note, via, ip, ua, request_path, prev_hash, hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [new Date(r.at), r.viewer_id, r.viewer_email, r.viewer_is_admin, r.subject_type, r.subject_id, r.subject_name, r.kind, JSON.stringify(r.fields), r.reason, r.note, r.via, r.ip, r.ua, r.request_path, prev, chainHash(prev, r)]);
}

/** Walks the whole chain. `bad` is the first row whose content or link doesn't match; `head` is the newest hash (keep a copy somewhere else: the monthly email carries it). */
export async function verifyChain(): Promise<{ ok: boolean; rows: number; head: string; bad?: number }> {
  const c = await conn();
  let prev = GENESIS, n = 0, last = 0;
  for (;;) { // in pages, so a long log is never held in memory at once
    const rows = (await c.query("SELECT * FROM pii_access WHERE id > $1 ORDER BY id LIMIT 2000", [last])).rows;
    if (!rows.length) return { ok: true, rows: n, head: prev };
    const r = checkRows(rows, prev);
    if ("bad" in r) return { ok: false, rows: n, head: prev, bad: r.bad };
    prev = r.head; n += rows.length; last = rows[rows.length - 1].id;
  }
}

// ---- settings
export async function getCfg(): Promise<Cfg> {
  const v = (await (await conn()).query("SELECT data FROM settings WHERE key = 'pii:cfg'")).rows[0]?.data ?? {};
  return { locked: v.locked === true, bulk: Number.isInteger(v.bulk) && v.bulk > 0 ? v.bulk : BULK_DEFAULT };
}
export async function saveCfg(x: any) {
  const cur = await getCfg(), next = { locked: typeof x?.locked === "boolean" ? x.locked : cur.locked, bulk: Number.isInteger(x?.bulk) && x.bulk >= 1 && x.bulk <= 1000 ? x.bulk : cur.bulk };
  await (await conn()).query("INSERT INTO settings (key, data) VALUES ('pii:cfg', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(next)]);
  return next;
}

// ---- who
const special = async (perm: string, email: string) => !!(await (await conn()).query("SELECT 1 FROM special_perms WHERE perm = $1 AND email = $2", [perm, email.toLowerCase()])).rowCount;
export async function viewer(): Promise<Viewer | null> {
  const m = await me();
  if (!m) return null;
  const id = (await (await conn()).query("SELECT id FROM site_users WHERE lower(email) = lower($1)", [m.email])).rows[0]?.id ?? null;
  return { id, email: m.email, name: m.name, isAdmin: m.perms.admin === "write" };
}
/** May this person open the Audit PII page? Full admins, or anyone on the Audit PII list. */
export async function mayAudit() { const v = await viewer(); return !!v && (v.isAdmin || (await special(PII_AUDIT_PERM, v.email))); }
const may = async (v: Viewer, kind: PiiKind) => v.isAdmin || special(PII_PERM[kind], v.email);

// ---- what each kind of retrieval reads. Each returns who it is about, which fields were shown, and the data.
type Out = { name: string; fields: string[]; data: unknown };
const dataUrl = (b: Buffer) => `data:${b.subarray(8, 12).toString("latin1") === "WEBP" ? "image/webp" : "image/jpeg"};base64,${b.toString("base64")}`;
const missing = () => new PiiError("Nothing on file.", 404);

const LOAD: Record<PiiKind, (c: PoolClient, s: Subject) => Promise<Out>> = {
  async personal(c, s) {
    if (s.type === "guest") {
      const r = (await c.query("SELECT first_name, last_name, email, phone, address, zip, state, guardian_name FROM guests WHERE id = $1", [s.id])).rows[0];
      if (!r) throw missing();
      return { name: `${r.first_name} ${r.last_name}`.trim(), fields: ["email", "phone", "address", "zip", "state", "guardian_name"], data: { email: r.email, phone: r.phone, address: r.address, zip: r.zip, state: r.state, guardian_name: r.guardian_name } };
    }
    const r = (await c.query("SELECT name, phone, address1, address2, city, state, zip FROM site_users WHERE id = $1", [s.id])).rows[0];
    if (!r) throw missing();
    const { name, ...data } = r;
    return { name, fields: Object.keys(data), data };
  },
  async emergency(c, s) {
    const g = s.type === "guest";
    const who = (await c.query(g ? "SELECT first_name || ' ' || last_name AS name FROM guests WHERE id = $1" : "SELECT name FROM site_users WHERE id = $1", [s.id])).rows[0];
    if (!who) throw missing();
    const rows = (await c.query(`SELECT id, first_name, last_name, phone, relationship, address, business_phone FROM ${g ? "guest_contacts WHERE guest_id" : "emergency_contacts WHERE user_id"} = $1 ORDER BY id`, [s.id])).rows;
    return { name: String(who.name).trim(), fields: ["contacts"], data: { contacts: rows } };
  },
  async id(c, s) {
    const g = s.type === "guest";
    const r = (await c.query(g ? "SELECT i.data, i.kind, to_char(i.expires_on,'YYYY-MM-DD') AS expires_on, x.first_name || ' ' || x.last_name AS name FROM guest_ids i JOIN guests x ON x.id = i.guest_id WHERE i.guest_id = $1"
      : "SELECT i.data, i.kind, to_char(i.expires_on,'YYYY-MM-DD') AS expires_on, u.name FROM member_ids i JOIN site_users u ON u.id = i.user_id WHERE i.user_id = $1", [s.id])).rows[0];
    if (!r) throw missing();
    return { name: String(r.name).trim(), fields: ["id_image"], data: { image: dataUrl(open(r.data)), kind: r.kind, expires_on: r.expires_on } };
  },
  async id_renewal(c, s) {
    const old = s.side === "old";
    const r = (await c.query(old ? "SELECT i.data, u.name FROM id_renewals r JOIN member_ids i ON i.user_id = r.user_id JOIN site_users u ON u.id = r.user_id WHERE r.id = $1 AND r.user_id = $2"
      : "SELECT r.data, u.name FROM id_renewals r JOIN site_users u ON u.id = r.user_id WHERE r.id = $1 AND r.user_id = $2 AND length(r.data) > 0", [s.renewal, s.id])).rows[0];
    if (!r) throw missing();
    return { name: String(r.name).trim(), fields: [old ? "id_image_on_file" : "id_image_new"], data: { image: dataUrl(open(r.data)) } };
  },
  async signed_doc(c, s) {
    const r = (await c.query("SELECT d.title, d.kind, d.pdf, d.user_id, d.guest_id, COALESCE(u.name, g.first_name || ' ' || g.last_name, '') AS name FROM sign_docs d LEFT JOIN site_users u ON u.id = d.user_id LEFT JOIN guests g ON g.id = d.guest_id WHERE d.id = $1 AND d.status = 'complete' AND d.kind IN ('waiver','guest')", [s.doc])).rows[0];
    if (!r?.pdf) throw missing();
    s.type = r.guest_id ? "guest" : "member"; s.id = r.guest_id ?? r.user_id ?? 0; // the row says who the document belongs to, not the caller
    return { name: String(r.name).trim(), fields: ["signed_pdf"], data: { pdf: "data:application/pdf;base64," + open(r.pdf).toString("base64"), title: r.title } };
  },
};

const toRow = (v: Viewer | null, email: string, s: Subject, kind: PiiKind, o: Out, via: string, why: { reason: string; note: string }, req: Request): Row => ({
  at: new Date(), viewer_id: v?.id ?? null, viewer_email: email, viewer_is_admin: !!v?.isAdmin, subject_type: s.type, subject_id: s.id, subject_name: o.name, kind, fields: o.fields, reason: why.reason, note: why.note, via,
  ip: (req.headers.get("fly-client-ip") ?? req.headers.get("x-forwarded-for")?.split(",").at(-1) ?? "").trim().slice(0, 100), ua: (req.headers.get("user-agent") ?? "").slice(0, 300), request_path: new URL(req.url).pathname,
});

/** The one way staff read someone's PII. Checks permission and the lock switch, requires a reason, writes the log row and reads the data in one transaction, then raises any alerts. */
export async function retrieve(req: Request, kindIn: unknown, subjectIn: any, reasonIn: unknown, noteIn: unknown) {
  const kind = String(kindIn) as PiiKind;
  if (!(kind in PII_KINDS)) throw new PiiError("Unknown kind of information.");
  const s: Subject = { type: subjectIn?.type === "guest" ? "guest" : "member", id: Number(subjectIn?.id), renewal: Number(subjectIn?.renewal) || undefined, side: subjectIn?.side === "old" ? "old" : "new", doc: Number(subjectIn?.doc) || undefined };
  if (!Number.isInteger(s.id)) throw new PiiError("Unknown person.");
  const v = await viewer();
  if (!v) throw new PiiError("not found", 404);
  if (!(await may(v, kind))) throw new PiiError("You don't have permission to see this. Ask an administrator to add you under Special permissions.", 403);
  if ((await getCfg()).locked) throw new PiiError("Viewing personal information is switched off right now.", 423);
  const why = checkReason(reasonIn, noteIn);
  if (typeof why === "string") throw new PiiError(why);
  if (!(await hit(`pii:${v.email}`, 60, 3600_000, true))) throw new PiiError("You've viewed a lot of records this hour. Try again later.", 429);
  const out = await withTx(async (c) => {
    const o = await LOAD[kind](c, s);
    await record(c, toRow(v, v.email, s, kind, o, "ui", why, req)); // if this throws the transaction rolls back and nothing is returned
    return o;
  });
  void alerts(v, kind, out.name).catch((e) => console.error("pii alerts:", e));
  return out.data;
}

/** A member (or a host, for the guests they brought) looking at data that is theirs to see: recorded as `self`, never blocks, left out of the board report. */
export async function logSelf(req: Request, who: { id: number | null; email: string }, s: Pick<Subject, "type" | "id">, kind: PiiKind, name: string, fields: string[]) {
  try {
    // A page showing 20 guest photos would write 20 permanent rows: one per viewer, person and kind every 10 minutes is enough.
    if ((await (await conn()).query("SELECT 1 FROM pii_access WHERE via = 'self' AND viewer_email = $1 AND subject_type = $2 AND subject_id = $3 AND kind = $4 AND at > now() - interval '10 minutes' LIMIT 1", [who.email, s.type, s.id, kind])).rowCount) return;
    await withTx((c) => record(c, toRow({ id: who.id, email: who.email, name: "", isAdmin: false }, who.email, s as Subject, kind, { name, fields, data: null }, "self", { reason: "self", note: "" }, req)));
  } catch (e) { console.error("pii self log:", e); }
}

/** The same, for a guest's data read through their own link or by the member who brought them. */
export async function logGuestSelf(req: Request, a: { g: { id: number; first_name: string; last_name: string; email: string }; host: boolean; hostId: number | null }, kind: PiiKind, fields: string[]) {
  const host = a.hostId ? (await (await conn()).query("SELECT email FROM site_users WHERE id = $1", [a.hostId])).rows[0]?.email : null;
  await logSelf(req, { id: a.hostId, email: host ?? (a.g.email || `guest:${a.g.id}`) }, { type: "guest", id: a.g.id }, kind, `${a.g.first_name} ${a.g.last_name}`.trim(), fields);
}

// ---- alerts
export async function adminEmails(): Promise<string[]> {
  return (await (await conn()).query("SELECT DISTINCT u.email FROM user_perms p JOIN site_users u ON u.id = p.user_id WHERE p.section = 'admin' AND p.level = 'write' AND u.disabled_at IS NULL")).rows.map((r) => r.email);
}
async function email(to: string[], subject: string, text: string) {
  const cfg = await getMailCfg().catch(() => null);
  if (!cfg || !mailReady(cfg)) return;
  for (const t of to) await sendQueued({ to: t, subject, text, html: `<p>${text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!).replace(/\n/g, "<br>")}</p>` } as any, cfg);
}
async function alerts(v: Viewer, kind: PiiKind, name: string) {
  const base = (await getMailCfg().catch(() => null))?.siteUrl?.replace(/\/+$/, "") ?? "";
  if (!v.isAdmin && (kind === "id" || kind === "id_renewal")) // a Gov ID opened by someone who isn't a full admin
    await notify("pii", { title: `${v.name || v.email} opened a Gov ID`, message: `${v.email} viewed the ID of ${name}.`, priority: 4, tags: "warning", click: base + "/admin/services/pii" });
  const { bulk } = await getCfg();
  const n = (await (await conn()).query("SELECT count(*)::int n FROM pii_access WHERE viewer_email = $1 AND via <> 'self' AND at > now() - interval '1 hour'", [v.email])).rows[0].n;
  if (n > bulk && (await hit(`pii-bulk:${v.email}`, 1, 3600_000))) {
    const msg = `${v.email} has viewed personal information ${n} times in the last hour (the alert level is ${bulk}).`;
    await notify("pii", { title: "Bulk viewing of personal information", message: msg, priority: 5, tags: "rotating_light", click: base + "/admin/services/pii" });
    await email(await adminEmails(), "Bulk viewing of personal information", msg + (base ? `\n\nSee ${base}/admin/services/pii` : ""));
  }
}

// ---- the Audit PII page's queries
export type Filter = { viewer?: string; subject?: string; kind?: string; reason?: string; ip?: string; from?: string; to?: string; self?: boolean; limit?: number; after?: number };
const dateOk = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
export async function events(f: Filter) {
  const like = (s?: string) => (s ? "%" + s.trim().replace(/[\\%_]/g, "\\$&") + "%" : null);
  const lim = Math.min(Math.max(Number(f.limit) || 200, 1), 5000);
  return (await (await conn()).query(`SELECT id, at, viewer_id, viewer_email, viewer_is_admin, subject_type, subject_id, subject_name, kind, fields, reason, note, via, ip, ua, request_path FROM pii_access
    WHERE ($1::text IS NULL OR viewer_email ILIKE $1) AND ($2::text IS NULL OR subject_name ILIKE $2) AND ($3::text IS NULL OR kind = $3) AND ($4::text IS NULL OR reason = $4) AND ($5::text IS NULL OR ip ILIKE $5)
      AND ($6::date IS NULL OR (at AT TIME ZONE '${TZ}')::date >= $6::date) AND ($7::date IS NULL OR (at AT TIME ZONE '${TZ}')::date <= $7::date) AND ($8 OR via <> 'self') AND ($9::int IS NULL OR id < $9)
    ORDER BY id DESC LIMIT ${lim}`, [like(f.viewer), like(f.subject), f.kind || null, f.reason || null, like(f.ip), dateOk(f.from), dateOk(f.to), f.self === true, f.after ?? null])).rows;
}
export async function bySubject(type: string, id: number) {
  return (await (await conn()).query("SELECT id, at, viewer_email, viewer_is_admin, kind, fields, reason, note, via FROM pii_access WHERE subject_type = $1 AND subject_id = $2 ORDER BY id DESC LIMIT 500", [type === "guest" ? "guest" : "member", id])).rows;
}
export async function findSubjects(q: string) {
  const like = "%" + q.trim().replace(/[\\%_]/g, "\\$&") + "%";
  return (await (await conn()).query(`SELECT subject_type, subject_id, max(subject_name) AS name, count(*)::int AS views FROM pii_access WHERE subject_name ILIKE $1 GROUP BY 1,2 ORDER BY max(at) DESC LIMIT 30`, [like])).rows;
}

/** Flags worth a second look. Quiet hours are 10pm to 6am site time; "new IP" means that viewer has never used that address before. */
export async function flags(days = 30) {
  const c = await conn(), cfg = await getCfg();
  const base = `FROM pii_access a WHERE a.via <> 'self' AND a.at > now() - make_interval(days => $1)`;
  const [bulk, off, newIp, repeat, fresh] = await Promise.all([
    c.query(`SELECT viewer_email, date_trunc('hour', at) AS hour, count(*)::int n ${base} GROUP BY 1,2 HAVING count(*) > $2 ORDER BY 2 DESC LIMIT 100`, [days, cfg.bulk]),
    c.query(`SELECT id, at, viewer_email, subject_name, kind ${base} AND (EXTRACT(hour FROM a.at AT TIME ZONE '${TZ}') >= 22 OR EXTRACT(hour FROM a.at AT TIME ZONE '${TZ}') < 6) ORDER BY id DESC LIMIT 100`, [days]),
    c.query(`SELECT id, at, viewer_email, ip, subject_name, kind ${base} AND a.ip <> '' AND NOT EXISTS (SELECT 1 FROM pii_access p WHERE p.viewer_email = a.viewer_email AND p.ip = a.ip AND p.id < a.id) ORDER BY id DESC LIMIT 100`, [days]),
    c.query(`SELECT viewer_email, subject_name, count(*)::int n, max(at) AS last ${base} AND a.at > now() - interval '7 days' GROUP BY viewer_email, subject_type, subject_id, subject_name HAVING count(*) >= 3 ORDER BY n DESC LIMIT 100`, [days]),
    c.query(`SELECT a.id, a.at, a.viewer_email, a.subject_name, a.kind ${base} AND EXISTS (SELECT 1 FROM audit g WHERE g.action = 'user.special' AND g.target ILIKE a.viewer_email || ': pii.%= yes' AND g.at < a.at AND g.at > a.at - interval '24 hours') ORDER BY a.id DESC LIMIT 100`, [days]),
  ]);
  return { bulk: bulk.rows, offHours: off.rows, newIp: newIp.rows, repeat: repeat.rows, justGranted: fresh.rows, threshold: cfg.bulk };
}

// ---- HTTP log correlation
/** Copies hits on PII routes out of the HTTP log (which is pruned by size) so the evidence outlives it. Safe to run any time. */
export async function copyHttpHits() {
  const c = await conn();
  if (!(await c.query("SELECT to_regclass('http_log') AS t")).rows[0].t) return;
  const since = (await c.query("SELECT COALESCE(max(at), now() - interval '2 days') AS at FROM pii_access_http")).rows[0].at;
  const ors = PII_ROUTES.map((_, i) => `(method = $${i * 2 + 2} AND path = $${i * 2 + 3})`).join(" OR ");
  await c.query(`INSERT INTO pii_access_http (src_id, at, method, path, ip, ua, referer, "user", status) SELECT id, at, method, path, ip, ua, referer, "user", status FROM http_log WHERE at >= $1::timestamptz - interval '1 minute' AND (${ors}) ON CONFLICT DO NOTHING`,
    [since, ...PII_ROUTES.flat()]);
}
/** Successful reads of PII routes (and retrievals), each marked with whether a pii_access row (same path, within two minutes, same person when the log knows who: the log stores "site:email" or "google:email") explains it. `month` (YYYY-MM, site time) replaces the day window. */
export async function httpHits(unmatchedOnly = false, days = 30, month?: string) {
  return (await (await conn()).query(`SELECT h.at, h.method, h.path, h.ip, h.ua, h.referer, h."user", h.status, m.id AS access_id FROM pii_access_http h
    LEFT JOIN LATERAL (SELECT id FROM pii_access a WHERE a.request_path = split_part(h.path, '?', 1) AND a.at BETWEEN h.at - interval '2 minutes' AND h.at + interval '2 minutes'
      AND (h."user" = '' OR lower(regexp_replace(h."user", '^(site|google):', '')) = lower(a.viewer_email)) ORDER BY abs(extract(epoch FROM a.at - h.at)) LIMIT 1) m ON true
    WHERE ${month ? `to_char(h.at AT TIME ZONE '${TZ}', 'YYYY-MM') = $1` : "h.at > now() - make_interval(days => $1::int)"} AND h.status BETWEEN 200 AND 299 AND ($2 = false OR m.id IS NULL) ORDER BY h.at DESC LIMIT 500`, [month ?? days, unmatchedOnly])).rows;
}

// ---- the monthly report
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
export const REPORT_TO = "board@kzoomakers.org";

/** The report for one month (YYYY-MM). Counts and names only: never a phone number, address or ID. */
export async function buildReport(month: string, base: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new PiiError("Month must look like 2026-05.");
  const c = await conn(), range = `a.via <> 'self' AND to_char(a.at AT TIME ZONE '${TZ}', 'YYYY-MM') = $1`;
  const q = async (sql: string) => (await c.query(sql, [month])).rows;
  const [tot, byViewer, subjects, reasons, share, grants, chain] = await Promise.all([
    q(`SELECT count(*)::int n FROM pii_access a WHERE ${range}`),
    q(`SELECT viewer_email, kind, count(*)::int n FROM pii_access a WHERE ${range} GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT subject_name, count(*)::int n FROM pii_access a WHERE ${range} GROUP BY subject_type, subject_id, subject_name ORDER BY n DESC, 1 LIMIT 200`),
    q(`SELECT reason, count(*)::int n FROM pii_access a WHERE ${range} GROUP BY 1 ORDER BY n DESC`),
    q(`SELECT viewer_is_admin, count(*)::int n FROM pii_access a WHERE ${range} GROUP BY 1`),
    q(`SELECT at, actor, target FROM audit WHERE action = 'user.special' AND target LIKE '%: pii.%' AND to_char(at AT TIME ZONE '${TZ}', 'YYYY-MM') = $1 ORDER BY at`),
    verifyChain(),
  ]);
  const { bulk } = await getCfg();
  const bulkFlags = (await c.query(`SELECT count(*)::int n FROM (SELECT 1 FROM pii_access a WHERE ${range} GROUP BY viewer_email, date_trunc('hour', a.at) HAVING count(*) > $2) x`, [month, bulk])).rows[0].n as number;
  const unmatched = (await httpHits(true, 0, month).catch(() => [])).length;
  const n = tot[0].n as number;
  const table = (heads: string[], rows: unknown[][]) => `<table cellpadding="6" style="border-collapse:collapse"><tr>${heads.map((h) => `<th align="left" style="border-bottom:1px solid #ccc">${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((x) => `<td style="border-bottom:1px solid #eee">${esc(x)}</td>`).join("")}</tr>`).join("")}</table>`;
  const adminN = share.find((x: any) => x.viewer_is_admin)?.n ?? 0;
  const html = `<h2>Personal information access: ${esc(month)}</h2>
<p><b>${n}</b> retrievals this month (${adminN} by full administrators, ${n - adminN} by people granted access). This report has no phone numbers, addresses or ID images.</p>
<h3>Who looked at what</h3>${table(["Viewer", "Kind", "Times"], byViewer.map((r: any) => [r.viewer_email, PII_KINDS[r.kind as PiiKind] ?? r.kind, r.n]))}
<h3>Why</h3>${table(["Reason", "Times"], reasons.map((r: any) => [r.reason, r.n]))}
<h3>People whose information was viewed (${subjects.length})</h3><p>${subjects.map((r: any) => `${esc(r.subject_name)} (${r.n})`).join(", ") || "none"}</p>
<h3>Access changes</h3>${grants.length ? table(["When", "By", "Change"], grants.map((g: any) => [new Date(g.at).toLocaleString("en-US", { timeZone: TZ }), g.actor, g.target])) : "<p>No permissions were granted or removed.</p>"}
<h3>Checks</h3><ul><li>Bulk-viewing flags raised: ${bulkFlags}</li><li>Requests to PII routes with no access record: ${unmatched}</li><li>Log integrity: ${chain.ok ? "intact" : `<b>BROKEN at row ${chain.bad}</b>`} (${chain.rows} rows)</li><li>Log head (keep a copy elsewhere): <code>${esc(chain.head)}</code></li></ul>
${base ? `<p><a href="${esc(base)}/admin/services/pii">Open the Audit PII page</a></p>` : ""}`;
  return { month, count: n, chainOk: chain.ok, subject: `Personal information access report: ${month}`, html };
}

/** Sends one month's report (nothing if there was no access, unless `force`) and records the run, so a month goes out once. */
export async function sendReport(month: string, force = false) {
  const cfg = await getMailCfg();
  const r = await buildReport(month, cfg.siteUrl?.replace(/\/+$/, "") ?? "");
  const c = await conn();
  if (!r.count && !force) { await c.query("INSERT INTO pii_report_runs (month, chain_ok, row_count, skipped) VALUES ($1,$2,0,true) ON CONFLICT DO NOTHING", [month, r.chainOk]); return { sent: false, ...r }; }
  if (!mailReady(cfg)) throw new Error("Email isn't set up.");
  await sendQueued({ to: REPORT_TO, subject: r.subject, html: r.html, text: r.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") } as any, cfg);
  await c.query("INSERT INTO pii_report_runs (month, sent_at, chain_ok, row_count) VALUES ($1, now(), $2, $3) ON CONFLICT (month) DO UPDATE SET sent_at = now(), chain_ok = EXCLUDED.chain_ok, row_count = EXCLUDED.row_count, skipped = false", [month, r.chainOk, r.count]);
  return { sent: true, ...r };
}
export const reportRuns = async () => (await (await conn()).query("SELECT month, sent_at, chain_ok, row_count, skipped FROM pii_report_runs ORDER BY month DESC LIMIT 36")).rows;

/** Hourly job. Once a month has ended (site time) it sends that month's report, so the last evening is included; if that fails it tries again every hour, and tells the admins once a day. */
export async function reportJob() {
  if (!db()) return;
  for (const month of [lastFullMonth(new Date(), TZ)]) {
    if ((await (await conn()).query("SELECT 1 FROM pii_report_runs WHERE month = $1", [month])).rowCount) continue;
    try { await sendReport(month); }
    catch (e: any) {
      console.error("pii report:", e);
      if (await hit(`pii-report-fail:${month}`, 1, 86_400_000)) await notify("pii", { title: "The PII report didn't send", message: `The ${month} report to the board failed: ${String(e?.message ?? e).slice(0, 200)}. It will try again tomorrow.`, priority: 4, tags: "warning" });
    }
  }
}
