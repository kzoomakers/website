import { AUDIT_SECTIONS } from "./audit-areas";
import type { Data } from "@puckeditor/core";
import { db, LOCKED, CAL_DEFAULT } from "./db";
import { guidedDef, withDefaults } from "./guided";
import boardSeed from "@/data/board.json";
import robotsSeed from "@/data/robots.json";
import privacySeed from "@/data/privacy.json";
import { seedHours, type Hours } from "./hours";
import navbar from "@/data/globals/navbar.json";

// Slugs come from URLs: whitelist chars so odd URLs are just "not found".
const SLUG_OK = /^[a-z0-9][a-z0-9_\-\/]*$/i;

export { LOCKED };
export const slugOf = (segs?: string[]) => (segs?.length ? segs.join("/") : "index");

async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}

/** null = no such page, or the site is not set up yet. */
export async function getPage(slug: string): Promise<Data | null> {
  if (!SLUG_OK.test(slug) || !db()) return null;
  const r = await (await conn()).query("SELECT data FROM pages WHERE slug = $1", [slug]);
  return r.rows[0]?.data ?? null;
}

// Key-order-independent JSON, so "nothing changed" is detected even though jsonb reorders keys.
const canon = (v: unknown): string => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));

async function revision(slug: string, who: string, action: string, target: string, data: unknown, menu?: Removed[]) {
  await (await conn()).query("INSERT INTO page_revisions (slug, actor, action, target, data, menu) VALUES ($1,$2,$3,$4,$5,$6)", [slug, who, action, target, JSON.stringify(data), menu?.length ? JSON.stringify(menu) : null]);
  await logAudit(who, action, slug + (target ? ` (${target})` : ""));
}

export async function savePage(slug: string, data: Data, who: string, action = "page.save", target = "") {
  if (!SLUG_OK.test(slug) || LOCKED.includes(slug)) throw new Error("bad slug");
  const c = await conn();
  const old = (await c.query("SELECT data FROM pages WHERE slug = $1", [slug])).rows[0]?.data;
  if (old && canon(old) === canon(data)) return;
  // First tracked save of a pre-existing page: keep what was there as the baseline revision.
  if (old && !(await c.query("SELECT 1 FROM page_revisions WHERE slug = $1 LIMIT 1", [slug])).rowCount) await revision(slug, "system", "page.import", "original", old);
  await c.query(
    `INSERT INTO pages (slug, data) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [slug, data]);
  await revision(slug, who, action, target, data);
}

export async function deletePage(slug: string, who: string, withMenu = false) {
  if (!SLUG_OK.test(slug) || LOCKED.includes(slug)) throw new Error("bad slug");
  const r = await (await conn()).query("DELETE FROM pages WHERE slug = $1 RETURNING data", [slug]);
  if (!r.rows[0]) return;
  let removed: Removed[] = [];
  if (withMenu) {
    const res = removeFor(await getMenu(), slug);
    removed = res.removed;
    if (removed.length) await saveMenu(res.menu, who, "menu.save", `removed ${slug}`);
  }
  await revision(slug, who, "page.delete", removed.length ? "with menu item" : "", r.rows[0].data, removed);
}

/** Puts back the menu links that were removed together with the page, if any. */
export async function restoreMenuFor(slug: string, id: number, who: string) {
  const r = await (await conn()).query("SELECT menu FROM page_revisions WHERE id = $1 AND slug = $2", [id, slug]);
  if (r.rows[0]?.menu) await saveMenu(restoreMenu(await getMenu(), r.rows[0].menu), who, "menu.save", `restored ${slug}`);
}

export const pageHistory = async (slug: string) => (await (await conn()).query(
  "SELECT id, at, actor, action, target FROM page_revisions WHERE slug = $1 ORDER BY id DESC LIMIT 100", [slug])).rows;

export const pageRevision = async (id: number) =>
  (await (await conn()).query("SELECT slug, data FROM page_revisions WHERE id = $1", [id])).rows[0] as { slug: string; data: Data } | undefined;

/** Pages whose most recent event is a delete (not recreated since). */
export const deletedPages = async () => (await (await conn()).query(
  `SELECT * FROM (SELECT DISTINCT ON (slug) id, slug, at, actor FROM page_revisions r
     WHERE action = 'page.delete' AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.slug = r.slug)
     ORDER BY slug, id DESC) t ORDER BY id DESC`)).rows;

export async function pageExists(slug: string) {
  return !!(await (await conn()).query("SELECT 1 FROM pages WHERE slug = $1", [slug])).rowCount;
}

export async function listPages(): Promise<string[]> {
  return (await (await conn()).query("SELECT slug FROM pages ORDER BY slug")).rows.map((r) => r.slug).filter((s) => !LOCKED.includes(s));
}

import { removeFor, restoreMenu, type MenuItem, type Removed } from "./menu";
export type { MenuItem };

// Seed menu = the migrated navbar.json (legacy entries with `items` are dropdowns, others links).
const seed = (navbar.menuItems as any[]).map(function f(m): MenuItem { return { label: m.label, ...(m.items ? { items: m.items.map(f) } : { href: m.href }) }; });

export async function getMenu(): Promise<MenuItem[]> {
  if (!db()) return seed;
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = 'menu'");
  return r.rows[0]?.data ?? seed;
}

export async function logAudit(who: string, action: string, target = "", data?: unknown) {
  if (!db()) return;
  await (await conn()).query("INSERT INTO audit (actor, action, target, data) VALUES ($1,$2,$3,$4)", [who, action, target, data === undefined ? null : JSON.stringify(data)]);
}

export async function saveMenu(menu: MenuItem[], who: string, action = "menu.save", target = "") {
  await (await conn()).query(
    `INSERT INTO settings (key, data) VALUES ('menu', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify(menu)]);
  await logAudit(who, action, target, menu);
}

export async function menuHistory() {
  return (await (await conn()).query(
    "SELECT id, at, actor, action, target, data FROM audit WHERE data IS NOT NULL AND action LIKE 'menu.%' ORDER BY id DESC LIMIT 100")).rows;
}

export async function revertMenu(id: number, who: string) {
  const r = await (await conn()).query("SELECT data FROM audit WHERE id = $1 AND action LIKE 'menu.%' AND data IS NOT NULL", [id]);
  if (!r.rows[0]) return false;
  await saveMenu(r.rows[0].data, who, "menu.revert", `revision #${id}`);
  return true;
}

const FAMILY = /^(menu|board|calendar|hours|robots|privacy|guided\.[^.]+)\./;
export type AuditDetail =
  | { kind: "none" }
  | { kind: "page"; before: unknown; after: unknown; revertable: boolean; why: string; newer: number; subject: string; undo: "revert" | "restore"; slug: string; revId: number; prevId?: number }
  | { kind: "data"; family: string; before: unknown; after: unknown; revertable: boolean; why: string; newer: number; subject: string; prevId?: number };

/** What an audit entry changed (before/after) and whether putting the "before" back is possible. */
export async function auditDetail(id: number): Promise<AuditDetail | null> {
  const c = await conn();
  const a = (await c.query("SELECT id, at, actor, action, target, data FROM audit WHERE id = $1", [id])).rows[0];
  if (!a) return null;
  if (a.action.startsWith("page.")) {
    const slug = a.target.split(" (")[0];
    const rev = (await c.query(
      `SELECT id, data FROM page_revisions WHERE slug = $1 AND action = $2 AND actor = $3 AND abs(extract(epoch FROM at - $4::timestamptz)) < 10
       ORDER BY abs(extract(epoch FROM at - $4::timestamptz)) LIMIT 1`, [slug, a.action, a.actor, a.at])).rows[0];
    if (!rev) return { kind: "none" };
    const prev = (await c.query("SELECT id, data FROM page_revisions WHERE slug = $1 AND id < $2 ORDER BY id DESC LIMIT 1", [slug, rev.id])).rows[0];
    const newer = (await c.query("SELECT count(*)::int n FROM page_revisions WHERE slug = $1 AND id > $2", [slug, rev.id])).rows[0].n;
    const exists = await pageExists(slug);
    const del = a.action === "page.delete";
    const base = { kind: "page" as const, newer, subject: `the page “${slug}”`, slug, revId: rev.id, prevId: prev?.id };
    if (del) return { ...base, before: rev.data, after: null, undo: "restore", revertable: !exists, why: exists ? "A page with this name exists again." : "" };
    return { ...base, before: prev?.data ?? null, after: rev.data, undo: "revert", revertable: !!prev && exists && !LOCKED.includes(slug),
      why: !prev ? "This is the first saved version, so there is nothing earlier to go back to." : !exists ? "The page has been deleted since. Restore it from the Deleted tab on the Pages screen." : "" };
  }
  const family = FAMILY.exec(a.action)?.[1];
  if (!family || a.data == null) return { kind: "none" };
  const prev = (await c.query("SELECT id, data FROM audit WHERE id < $1 AND data IS NOT NULL AND left(action, $3) = $2 ORDER BY id DESC LIMIT 1", [id, family + ".", family.length + 1])).rows[0];
  const newer = (await c.query("SELECT count(*)::int n FROM audit WHERE id > $1 AND data IS NOT NULL AND left(action, $3) = $2", [id, family + ".", family.length + 1])).rows[0].n;
  const same = prev && canon(prev.data) === canon(a.data);
  const subject = family === "menu" ? "the site menu" : family === "board" ? "the board page" : family === "calendar" ? "the calendar link" : family === "hours" ? "the hours of operation" : family === "robots" ? "robots.txt" : family === "privacy" ? "the privacy statement" : `the ${guidedDef(family.slice(7))?.label ?? family.slice(7)} page`;
  return { kind: "data", family, before: prev?.data ?? null, after: a.data, newer, subject, prevId: prev?.id, revertable: !!prev && !same,
    why: !prev ? "This is the first saved version, so there is nothing earlier to go back to." : same ? "This change did not alter anything." : "" };
}

/** Puts back the state from before audit entry `id`; false if that is not possible. */
export async function revertAudit(id: number, who: string) {
  const d = await auditDetail(id);
  if (!d || d.kind === "none" || !d.revertable) return false;
  if (d.kind === "page") {
    if (d.undo === "restore") { await savePage(d.slug, d.before as Data, who, "page.restore", `revision #${d.revId}`); await restoreMenuFor(d.slug, d.revId, who); }
    else await savePage(d.slug, d.before as Data, who, "page.revert", `revision #${d.prevId}`);
    return true;
  }
  return d.family === "menu" ? revertMenu(d.prevId!, who) : revertSetting(d.family, d.prevId!, who);
}

export type AuditQuery = { q?: string; actors?: string[]; sections?: string[]; actions?: string[]; from?: string; to?: string; sort?: string; offset?: number; unit?: string };

/** Filtered, sorted audit entries plus a time histogram and the people/actions available to filter by (those ignore the people/section/action filters, so you can still pick more). */
export async function queryAudit(f: AuditQuery) {
  const c = await conn();
  const like = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const time: string[] = [], tp: unknown[] = [];
  const add = (arr: unknown[], v: unknown) => `$${arr.push(v)}`;
  const valid = (d?: string) => (d && !isNaN(Date.parse(d)) ? d : null);
  if (valid(f.from)) time.push(`at >= ${add(tp, f.from)}`);
  if (valid(f.to)) time.push(`at < ${add(tp, f.to)}`);
  if (f.q?.trim()) { const p = add(tp, like(f.q.trim())); time.push(`(actor ILIKE ${p} OR action ILIKE ${p} OR target ILIKE ${p})`); }
  const where = (extra: string[], ps: unknown[]) => (time.length + extra.length ? "WHERE " + [...time, ...extra].join(" AND ") : "");
  const ps = [...tp], extra: string[] = [];
  if (f.actors?.length) extra.push(`actor = ANY(${add(ps, f.actors)})`);
  if (f.actions?.length) extra.push(`action = ANY(${add(ps, f.actions)})`);
  const pats = (f.sections ?? []).flatMap((x) => AUDIT_SECTIONS[x]?.like ?? []);
  if (f.sections?.length) extra.push(`action LIKE ANY(${add(ps, pats)})`);
  const order = { old: "id ASC", actor: "lower(actor) ASC, id DESC", action: "action ASC, id DESC" }[f.sort ?? ""] ?? "id DESC";
  const unit = ["hour", "day", "week", "month"].includes(f.unit ?? "") ? f.unit : "day";
  const W = where(extra, ps);
  const [rows, total, buckets, actors, actions] = await Promise.all([
    c.query(`SELECT id, at, actor, action, target FROM audit ${W} ORDER BY ${order} LIMIT 100 OFFSET ${add(ps, Math.max(0, Number(f.offset) || 0))}`, ps),
    c.query(`SELECT count(*)::int n FROM audit ${W}`, ps.slice(0, ps.length - 1)),
    c.query(`SELECT date_trunc('${unit}', at) t, action, count(*)::int n FROM audit ${W} GROUP BY 1, 2 ORDER BY 1`, ps.slice(0, ps.length - 1)),
    c.query(`SELECT actor v, count(*)::int n FROM audit ${where([], tp)} GROUP BY 1 ORDER BY 2 DESC LIMIT 200`, tp),
    c.query(`SELECT action v, count(*)::int n FROM audit ${where([], tp)} GROUP BY 1 ORDER BY 2 DESC LIMIT 300`, tp),
  ]);
  return { rows: rows.rows, total: total.rows[0].n, buckets: buckets.rows, actors: actors.rows, actions: actions.rows };
}


export async function getCalUrl(): Promise<string> {
  if (!db()) return CAL_DEFAULT;
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = 'calendar'");
  return r.rows[0]?.data?.url ?? CAL_DEFAULT;
}

export async function setCalUrl(url: string, who: string, action = "calendar.url", target = "") {
  const old = await getCalUrl();
  await (await conn()).query(
    `INSERT INTO settings (key, data) VALUES ('calendar', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify({ url })]);
  await logAudit(who, action, `${target ? target + ": " : ""}changed from ${old} to ${url}`, { url });
}

export async function getHours(): Promise<Hours> {
  if (!db()) return seedHours;
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = 'hours'");
  return r.rows[0]?.data ?? seedHours;
}

export async function saveHours(h: Hours, who: string, action = "hours.save", target = "") {
  await (await conn()).query(
    `INSERT INTO settings (key, data) VALUES ('hours', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify(h)]);
  await logAudit(who, action, target || "edited hours", h);
}

export async function getRobots(): Promise<string> {
  if (!db()) return robotsSeed.text;
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = 'robots'");
  return r.rows[0]?.data?.text ?? robotsSeed.text;
}

export async function saveRobots(text: string, who: string, action = "robots.save", target = "") {
  await (await conn()).query(
    `INSERT INTO settings (key, data) VALUES ('robots', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify({ text })]);
  await logAudit(who, action, target || "edited robots.txt", { text });
}

export async function getPrivacy(): Promise<string> {
  if (!db()) return privacySeed.text;
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = 'privacy'");
  return r.rows[0]?.data?.text ?? privacySeed.text;
}

export async function savePrivacy(text: string, who: string, action = "privacy.save", target = "") {
  await (await conn()).query(
    `INSERT INTO settings (key, data) VALUES ('privacy', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify({ text })]);
  await logAudit(who, action, target || "edited the privacy statement", { text });
}

export type Board = typeof boardSeed;

export async function getBoard(): Promise<Board> {
  if (!db()) return boardSeed;
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = 'board'");
  return r.rows[0]?.data ?? boardSeed;
}

export async function saveBoard(b: Board, who: string, action = "board.save", target = "") {
  const old = await getBoard();
  await (await conn()).query(
    `INSERT INTO settings (key, data) VALUES ('board', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify(b)]);
  const names = (x: Board) => x.members.map((m) => m.name);
  const was = names(old), now = names(b);
  const note = [
    now.filter((n) => !was.includes(n)).map((n) => `added ${n}`),
    was.filter((n) => !now.includes(n)).map((n) => `removed ${n}`),
    JSON.stringify(was.filter((n) => now.includes(n))) !== JSON.stringify(now.filter((n) => was.includes(n))) ? ["reordered"] : [],
    b.members.filter((m) => { const o = old.members.find((x) => x.name === m.name); return o && JSON.stringify(o) !== JSON.stringify(m); }).map((m) => `edited ${m.name}`),
    b.title !== old.title || b.intro !== old.intro ? ["edited intro"] : [],
  ].flat().join(", ");
  await logAudit(who, action, target || note || "no changes", b);
}

// Settings screens (board, calendar) keep their snapshots in the audit log, like the menu: list them, put one back.
export const settingHistory = async (prefix: string) => (await (await conn()).query(
  "SELECT id, at, actor, action, target, data FROM audit WHERE data IS NOT NULL AND action LIKE $1 ORDER BY id DESC LIMIT 100", [prefix + ".%"])).rows;

export async function revertSetting(prefix: string, id: number, who: string) {
  const r = await (await conn()).query("SELECT data FROM audit WHERE id = $1 AND action LIKE $2 AND data IS NOT NULL", [id, prefix + ".%"]);
  if (!r.rows[0]) return false;
  const how = [`${prefix}.revert`, `revision #${id}`] as const;
  if (prefix === "board") await saveBoard(r.rows[0].data, who, ...how);
  else if (prefix === "hours") await saveHours(r.rows[0].data, who, ...how);
  else if (prefix === "robots") await saveRobots(r.rows[0].data.text, who, ...how);
  else if (prefix === "privacy") await savePrivacy(r.rows[0].data.text, who, ...how);
  else if (prefix === "calendar") await setCalUrl(r.rows[0].data.url, who, ...how);
  else await saveGuided(prefix.replace("guided.", ""), r.rows[0].data, who, ...how);
  return true;
}

/** Stored content of a guided page; null for slugs that are not guided. */
export async function getGuided(slug: string): Promise<any> {
  if (!guidedDef(slug) || !db()) return null;
  const r = await (await conn()).query("SELECT data FROM settings WHERE key = $1", ["guided:" + slug]);
  return r.rows[0] ? withDefaults(guidedDef(slug)!.fields, r.rows[0].data) : null;
}

export async function saveGuided(slug: string, data: any, who: string, action = `guided.${slug}.save`, target = "") {
  const def = guidedDef(slug)!;
  const old = (await getGuided(slug)) ?? {};
  await (await conn()).query(
    `INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, ["guided:" + slug, JSON.stringify(data)]);
  const changed = def.fields.filter((f) => canon(old[f.key]) !== canon(data[f.key])).map((f) => f.label);
  await logAudit(who, action, target || (changed.length ? "edited " + changed.join(", ") : "no changes"), data);
}
