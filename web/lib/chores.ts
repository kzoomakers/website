import { db } from "./db";
import { achievements, choreName, ROOM, dayNum, dueAt, MEASURES, periodStart, PERIODS, stats, type Achievement, type Chore, type Done, daysBetween, matchMember } from "./chores-calc";

// Volunteer chores, ported from YAMNet (shop/volunteer.py): the chores that keep the space running, how often each wants doing, and the time members give to them.
export const MAX_SHIFT_H = 12, MAX_LOG_H = 16; // an open shift longer than this needs its minutes said; the longest a logged stretch may claim

let ready: Promise<unknown> | undefined;
async function conn() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= (async () => {
    const p = d.pool;
    await p.query(`CREATE TABLE IF NOT EXISTS chores (id serial PRIMARY KEY, name text NOT NULL, aliases text[] NOT NULL DEFAULT '{}', every_days real, notes text NOT NULL DEFAULT '', snoozed_until timestamptz,
      active boolean NOT NULL DEFAULT true, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz)`);
    // owner_name is the name as it was, so the log still reads right if the member is deleted.
    await p.query(`CREATE TABLE IF NOT EXISTS chore_log (id serial PRIMARY KEY, chore_id int NOT NULL REFERENCES chores, user_id int REFERENCES site_users ON DELETE SET NULL, owner_name text NOT NULL DEFAULT '',
      started_at timestamptz NOT NULL, ended_at timestamptz, minutes real, how text NOT NULL DEFAULT 'web', said text NOT NULL DEFAULT '', source text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
    // Chores are filed as area > station > task. Existing rows are filed once, by their old name; the old name stays as an alias so spoken requests still match.
    for (const c of ["area", "station", "task"]) await p.query(`ALTER TABLE chores ADD COLUMN IF NOT EXISTS ${c} text NOT NULL DEFAULT ''`);
    for (const [old, area, station, task] of FILED) {
      await p.query("UPDATE chores SET area=$2, station=$3, task=$4, name=$5, aliases = array_append(aliases, name) WHERE name=$1 AND area=''", [old, area, station, task, choreName(area, station, task)]);
    }
    await p.query("CREATE INDEX IF NOT EXISTS chore_log_chore ON chore_log (chore_id, ended_at)");
    await p.query("CREATE INDEX IF NOT EXISTS chore_log_user ON chore_log (user_id, started_at)");
    await p.query(`CREATE TABLE IF NOT EXISTS chore_achievements (id serial PRIMARY KEY, chore_id int REFERENCES chores, measure text NOT NULL, goal real NOT NULL, title text NOT NULL,
      icon text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`);
  })().catch((x) => { ready = undefined; throw x; });
  await ready;
  return d.pool;
}
// shortcut: the old Kzoo Makers chore names, filed by name; once those rows are filed this does nothing. Delete after the first deploy.
const FILED: [string, string, string, string][] = [
  ["Sweep - Wood shop", "Wood Shop", ROOM, "Sweep Floor"], ["Empty Wood Collection", "Wood Shop", "Dust Collection", "Empty"], ["Lube - Table Sawstop", "Wood Shop", "Table Saw", "Lube Adjustment Gears"],
  ["Sweep - Combustables Room", "Combustables Room", ROOM, "Sweep Floor"], ["Sweep - Front rooms", "Front Rooms", ROOM, "Sweep Floor"], ["Sweep - Meeting Area", "Meeting Area", ROOM, "Sweep Floor"],
  ["Meeting Area - Sanitize Tables", "Meeting Area", "Tables", "Sanitize"], ["Clean Bathrooms", "Bathrooms", ROOM, "Clean"], ["Check furnace filters", "Building", "Furnace", "Check Filters"],
  ["Mow Lawn", "Grounds", "Lawn", "Mow"], ["Water plants OUTSIDE", "Grounds", "Plants", "Water"], ["Tech - Website Maint", "Tech", "Website", "Maintain"],
];
const q = async (sql: string, args: unknown[] = []) => (await (await conn()).query(sql, args)).rows;
const E = (c: string) => `extract(epoch from ${c})::float8`;
const nowS = () => Date.now() / 1000;

export async function allChores(): Promise<Chore[]> {
  return (await q(`SELECT id, name, area, station, task, aliases, every_days, notes, ${E("snoozed_until")} AS snoozed_until, active, ${E("created_at")} AS created_at FROM chores ORDER BY name`));
}
async function finished(): Promise<Done[]> {
  return q(`SELECT id, chore_id, user_id, owner_name, ${E("started_at")} AS started_at, ${E("ended_at")} AS ended_at, minutes FROM chore_log WHERE ended_at IS NOT NULL ORDER BY ended_at`);
}
const lastEnds = (rows: Done[]) => { const m = new Map<number, number>(); for (const r of rows) m.set(r.chore_id, Math.max(m.get(r.chore_id) ?? 0, r.ended_at)); return m; };
const first = (n: string) => (n || "").split(" ")[0];

/** The chores with when each is due, who did it last and who is on it now. which = "due" keeps those due by the end of today. */
export async function listing(which: "all" | "due" = "all") {
  const [cs, rows, open] = await Promise.all([allChores(), finished(), q("SELECT chore_id, owner_name FROM chore_log WHERE ended_at IS NULL")]);
  const ends = lastEnds(rows), now = nowS();
  const lastBy = new Map<number, string>();
  for (const r of rows) lastBy.set(r.chore_id, r.owner_name);
  const out = cs.filter((c) => c.active).map((c) => {
    const d = dueAt(c, ends.get(c.id) ?? null), last = ends.get(c.id) ?? null;
    return { id: c.id, name: c.name, area: c.area, station: c.station, task: c.task, aliases: c.aliases, every_days: c.every_days, notes: c.notes, due_at: d, overdue_days: d === null ? null : daysBetween(d, now),
      last_done_at: last, last_by: last ? first(lastBy.get(c.id) ?? "") : null, being_done_by: open.filter((o) => o.chore_id === c.id).map((o) => first(o.owner_name)) };
  });
  const list = which === "due" ? out.filter((c) => c.due_at !== null && dayNum(c.due_at) <= dayNum(now)) : out;
  return list.sort((a, b) => (a.due_at ?? Infinity) - (b.due_at ?? Infinity) || a.name.localeCompare(b.name));
}

export async function saveChore(x: any, who: string) {
  const [area, station, task] = (["area", "station", "task"] as const).map((k) => String(x[k] ?? "").trim().replace(/\s+/g, " ").slice(0, 60));
  const name = choreName(area, station, task), every = x.every_days === "" || x.every_days == null ? null : Number(x.every_days);
  if (!name) throw new Error("Pick an area and say what the task is, like Wood Shop and Sweep Floor.");
  if (!area || !task) throw new Error("Pick an area and say what the task is, like Wood Shop and Sweep Floor.");
  if (every !== null && !(every > 0 && every <= 366)) throw new Error("Every so many days, between 1 and 366; leave it empty for as needed.");
  const aliases = (Array.isArray(x.aliases) ? x.aliases : String(x.aliases ?? "").split(",")).map((a: unknown) => String(a).trim()).filter(Boolean).slice(0, 12);
  const notes = String(x.notes ?? "").trim().slice(0, 1000);
  if (x.id) {
    if (!(await q("UPDATE chores SET name=$2, every_days=$3, aliases=$4, notes=$5, area=$6, station=$7, task=$8, updated_at=now() WHERE id=$1 RETURNING id", [x.id, name, every, aliases, notes, area, station || ROOM, task])).length) throw new Error("No such chore.");
    return x.id as number;
  }
  return (await q("INSERT INTO chores (name, every_days, aliases, notes, created_by, area, station, task) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [name, every, aliases, notes, who, area, station || ROOM, task]))[0].id as number;
}
/** Rename an area (every chore in it) or one station within an area, so a typo is fixed once. */
export async function renameGroup(area: string, station: string | null, to: string) {
  to = to.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!to) throw new Error("Type the new name.");
  const rows = await q(`SELECT id, area, station, task FROM chores WHERE area = $1 AND ($2::text IS NULL OR station = $2)`, [area, station]);
  if (!rows.length) throw new Error("Nothing is filed there.");
  for (const r of rows) {
    const a = station === null ? to : r.area, s = station === null ? r.station : to;
    await q("UPDATE chores SET area=$2, station=$3, name=$4, updated_at=now() WHERE id=$1", [r.id, a, s, choreName(a, s, r.task)]);
  }
  return rows.length;
}
export const snoozeChore = (id: number, days: number) => q("UPDATE chores SET snoozed_until = (date_trunc('day', now() AT TIME ZONE 'America/Detroit') + make_interval(days => $2::int + 1)) AT TIME ZONE 'America/Detroit' WHERE id = $1", [id, Math.min(Math.max(Math.round(days) || 7, 1), 366)]);
export const deleteChore = (id: number) => q("UPDATE chores SET active = false, updated_at = now() WHERE id = $1", [id]); // the hours people gave stay counted

// ---- members
export const members = (): Promise<{ id: number; name: string }[]> => q("SELECT id, name FROM site_users WHERE approval = 'approved' AND disabled_at IS NULL ORDER BY name");
export async function memberById(id: number) {
  const m = (await q("SELECT id, name FROM site_users WHERE id = $1 AND approval = 'approved' AND disabled_at IS NULL", [id]))[0];
  if (!m) throw new Error("No such member. They need an approved account in the CRM.");
  return m as { id: number; name: string };
}
export const whoIs = async (said: string) => matchMember(String(said ?? "").slice(0, 100), await members());

// ---- time given
export const openShifts = (userId?: number) => q(`SELECT l.id, l.chore_id, c.name AS chore, l.user_id, l.owner_name, ${E("l.started_at")} AS started_at FROM chore_log l JOIN chores c ON c.id = l.chore_id
  WHERE l.ended_at IS NULL AND ($1::int IS NULL OR l.user_id = $1) ORDER BY l.started_at`, [userId ?? null]);

export async function startShift(choreId: number, userId: number, how = "web", source = "") {
  const m = await memberById(userId);
  if (!(await q("SELECT 1 FROM chores WHERE id = $1 AND active", [choreId])).length) throw new Error("No such chore.");
  if ((await q("SELECT 1 FROM chore_log WHERE chore_id = $1 AND user_id = $2 AND ended_at IS NULL", [choreId, userId])).length) throw new Error("They already started that one. Finish it first.");
  return (await q("INSERT INTO chore_log (chore_id, user_id, owner_name, started_at, how, source) VALUES ($1,$2,$3,now(),$4,$5) RETURNING id", [choreId, userId, m.name, how, source]))[0].id as number;
}

/** Close an open shift now, or after `minutes`. Without minutes, a shift open past MAX_SHIFT_H is refused: they forgot to say done. */
export async function finishShift(id: number, minutes?: number | null) {
  const s = (await q(`SELECT id, ${E("started_at")} AS started_at FROM chore_log WHERE id = $1 AND ended_at IS NULL`, [id]))[0];
  if (!s) throw new Error("That's already finished, or doesn't exist.");
  const m = minutes == null ? (nowS() - s.started_at) / 60 : Number(minutes);
  if (!(m > 0) || m > MAX_LOG_H * 60) throw new Error(`How many minutes, up to ${MAX_LOG_H} hours.`);
  if (minutes == null && m > MAX_SHIFT_H * 60) throw new Error(`That shift has been open over ${MAX_SHIFT_H} hours. Say how many minutes it really took.`);
  await q("UPDATE chore_log SET ended_at = to_timestamp($2), minutes = $3 WHERE id = $1", [id, minutes == null ? nowS() : s.started_at + m * 60, Math.round(m * 10) / 10]);
  return { id, minutes: Math.round(m * 10) / 10 };
}

/** Time already done, typed in or said: the member, the chore, how long, and which day (default today, ending now). */
export async function logTime(choreId: number, userId: number, minutes: number, date?: string, how = "web", said = "", source = "") {
  const m = await memberById(userId);
  if (!(await q("SELECT 1 FROM chores WHERE id = $1 AND active", [choreId])).length) throw new Error("No such chore.");
  if (!(minutes > 0 && minutes <= MAX_LOG_H * 60)) throw new Error(`How many minutes, up to ${MAX_LOG_H} hours.`);
  let end = nowS();
  if (date) { end = Date.parse(date.length === 10 ? date + "T12:00:00Z" : date) / 1000; if (!Number.isFinite(end) || end > nowS() + 60) throw new Error("That date doesn't look right."); }
  return (await q("INSERT INTO chore_log (chore_id, user_id, owner_name, started_at, ended_at, minutes, how, said, source) VALUES ($1,$2,$3,to_timestamp($4),to_timestamp($5),$6,$7,$8,$9) RETURNING id",
    [choreId, userId, m.name, end - minutes * 60, end, minutes, how, said.slice(0, 500), source]))[0].id as number;
}
export const deleteLog = (id: number) => q("DELETE FROM chore_log WHERE id = $1", [id]);
export const recentLog = (limit = 200) => q(`SELECT l.id, l.chore_id, c.name AS chore, l.user_id, l.owner_name, ${E("l.started_at")} AS started_at, ${E("l.ended_at")} AS ended_at, l.minutes, l.how, l.source
  FROM chore_log l JOIN chores c ON c.id = l.chore_id ORDER BY l.started_at DESC LIMIT $1`, [limit]);

/** [{ name, user_id, hours, times }] since a period began, most hours first; one member when userId is given. */
export async function hours(period = "this_month", userId?: number) {
  if (!(PERIODS as readonly string[]).includes(period)) throw new Error("Unknown period.");
  return q(`SELECT owner_name AS name, user_id, round((sum(minutes) / 60.0)::numeric, 2)::float8 AS hours, count(*)::int AS times FROM chore_log
    WHERE ended_at IS NOT NULL AND started_at >= to_timestamp($1) AND ($2::int IS NULL OR user_id = $2) GROUP BY COALESCE(user_id::text, owner_name), owner_name, user_id ORDER BY 3 DESC`, [periodStart(period, nowS()), userId ?? null]);
}

// ---- stats and achievements
export async function statsAll() {
  const [cs, rows] = await Promise.all([allChores(), finished()]), ends = lastEnds(rows);
  return stats(cs, rows, nowS(), (id) => ends.get(id) ?? null);
}
const achRows = (): Promise<Achievement[]> => q("SELECT id, chore_id, measure, goal, title, icon, note FROM chore_achievements WHERE active ORDER BY goal");
export async function achievementsAll() {
  const [cs, rows, list] = await Promise.all([allChores(), finished(), achRows()]);
  return achievements(cs, rows, list, nowS());
}
export async function saveAchievement(x: any) {
  const title = String(x.title ?? "").trim().slice(0, 40), goal = Number(x.goal), chore = x.chore_id ? Number(x.chore_id) : null;
  if (!title) throw new Error("An achievement needs a title to earn, like Porcelain Knight.");
  if (!(x.measure in MEASURES)) throw new Error("Count times done, hours, on-time visits, overdue rescues or different days.");
  if (!(goal > 0 && goal <= 100000)) throw new Error("How many, more than none.");
  if (chore && !(await q("SELECT 1 FROM chores WHERE id = $1", [chore])).length) throw new Error("No such chore.");
  const a = [chore, x.measure, goal, title, String(x.icon ?? "").trim().slice(0, 20), String(x.note ?? "").trim().slice(0, 200)];
  if (x.id) { await q("UPDATE chore_achievements SET chore_id=$2, measure=$3, goal=$4, title=$5, icon=$6, note=$7 WHERE id=$1", [x.id, ...a]); return x.id as number; }
  return (await q("INSERT INTO chore_achievements (chore_id, measure, goal, title, icon, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", a))[0].id as number;
}
export const deleteAchievement = (id: number) => q("UPDATE chore_achievements SET active = false WHERE id = $1", [id]); // who earned it is worked out from the log, so nothing else goes
