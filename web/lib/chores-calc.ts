// Volunteer chores: due dates, stats and achievements. Ported from YAMNet's shop/volunteer.py. Pure (no database), so it is testable.
// Every time is epoch seconds; "days" are calendar days in the space's timezone.
export const TZ = "America/Detroit"; // shortcut: fixed timezone, make it a setting if the space ever moves

export type Chore = { id: number; name: string; aliases: string[]; every_days: number | null; notes: string; snoozed_until: number | null; active: boolean; created_at: number };
export type Shift = { id: number; chore_id: number; user_id: number | null; owner_name: string; started_at: number; ended_at: number | null; minutes: number | null };
export type Done = Shift & { ended_at: number };
export type Award = { kind: string; [k: string]: unknown };

// ---- local-time helpers
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export function lp(ts: number) {
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ts * 1000))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
}
const offset = (ts: number) => { const p = lp(ts); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) / 1000 - Math.floor(ts); };
/** The local calendar day as a number (days since 1970-01-01). */
export const dayNum = (ts: number) => { const p = lp(ts); return Date.UTC(p.y, p.m - 1, p.d) / 86400000; };
export const daysBetween = (a: number, b: number) => dayNum(b) - dayNum(a);
/** Epoch of local midnight at the start of day number n. */
export function dayStart(n: number) {
  const mid = n * 86400;
  let t = mid;
  for (let i = 0; i < 2; i++) t = mid - offset(t);
  return t;
}
const monthStart = (y: number, m: number) => dayStart(Date.UTC(y, m - 1, 1) / 86400000);
const weekOf = (ts: number) => Math.floor((dayNum(ts) - lp(ts).wd) / 7); // consecutive weeks are consecutive numbers

// ---- when a chore is due
export const dueAt = (c: Chore, lastEnd: number | null) =>
  c.every_days ? Math.max((lastEnd ?? c.created_at) + c.every_days * 86400, c.snoozed_until ?? 0) : null;

export const PERIODS = ["today", "this_week", "this_month", "this_year", "all_time"] as const;
export function periodStart(period: string, now: number) {
  const p = lp(now), n = dayNum(now);
  return period === "today" ? dayStart(n) : period === "this_week" ? dayStart(n - p.wd) : period === "this_month" ? monthStart(p.y, p.m) : period === "this_year" ? monthStart(p.y, 1) : 0;
}

// ---- stats
export const STAT_PERIODS = ["this_week", "this_month", "this_year", "all_time"] as const;
const EARLY = 9, LATE = 20; // a shift started before 9am is an early bird's, after 8pm a night owl's
const HOLIDAYS = new Set(["12-24", "12-25", "12-31", "1-1"]);
const CLUBS = [10, 25, 50, 100, 250, 500, 1000], SHIFT_MARKS = [50, 100, 250, 500, 1000, 2500, 5000];

export const keyOf = (r: Shift) => (r.user_id ? "u" + r.user_id : "n:" + (r.owner_name || "").toLowerCase());
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mins = (r: Shift) => r.minutes ?? 0;

/** {shift id: days late} for each visit to a chore with a schedule. A second shift the same day is the same visit, unscored. */
function lateness(rows: Done[], byId: Map<number, Chore>) {
  const out = new Map<number, number>(), prev = new Map<number, number>();
  for (const r of rows) {
    const c = byId.get(r.chore_id);
    if (!c?.every_days) continue;
    const p = prev.get(c.id);
    if (p !== undefined && daysBetween(p, r.ended_at) === 0) continue;
    out.set(r.id, daysBetween((p ?? c.created_at) + c.every_days * 86400, r.ended_at));
    prev.set(c.id, r.ended_at);
  }
  return out;
}

function streaks(rows: Done[], now: number) {
  const weeks = new Map<string, Set<number>>();
  for (const r of rows) (weeks.get(keyOf(r)) ?? weeks.set(keyOf(r), new Set()).get(keyOf(r))!).add(weekOf(r.started_at));
  const out = new Map<string, number>(), cur = weekOf(now);
  for (const [k, ws] of weeks) { let w = ws.has(cur) ? cur : cur - 1, n = 0; while (ws.has(w)) { n++; w--; } out.set(k, n); }
  return out;
}

/** [label, from, to] for the chart of hours over the period. */
function buckets(period: string, start: number, now: number): [string, number, number][] {
  const s = lp(start), n0 = dayNum(start);
  if (period === "this_week" || period === "this_month") {
    const n = period === "this_week" ? 7 : new Date(Date.UTC(s.y, s.m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => [period === "this_week" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] : String(i + 1), dayStart(n0 + i), dayStart(n0 + i + 1)]);
  }
  const months: [string, number, number][] = [], end = period === "this_year" ? { y: s.y, m: 12 } : lp(now);
  for (let y = s.y, m = period === "this_year" ? 1 : s.m; y < end.y || (y === end.y && m <= end.m); ) {
    const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
    months.push([new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + (period === "this_year" ? "" : " " + String(y).slice(2)), monthStart(y, m), monthStart(ny, nm)]);
    y = ny; m = nm;
  }
  if (months.length > 36) {
    const ys = [...new Set(months.map((m) => lp(m[1]).y))];
    return ys.map((y) => [String(y), monthStart(y, 1), monthStart(y + 1, 1)]);
  }
  return months;
}

const summary = (rows: Done[]) => ({ hours: Math.round(sum(rows.map(mins)) / 6) / 10, sessions: rows.length, volunteers: new Set(rows.map(keyOf)).size });
const run = (days: number[]) => { let best = 0, n = 0, prev: number | null = null; for (const d of [...days].sort((a, b) => a - b)) { n = prev !== null && d - prev === 1 ? n + 1 : 1; best = Math.max(best, n); prev = d; } return best; };
const count = <T,>(rows: T[], key: (r: T) => string, when: (r: T) => boolean = () => true) => { const o = new Map<string, number>(); for (const r of rows) if (when(r)) o.set(key(r), (o.get(key(r)) ?? 0) + 1); return o; };
const top = (m: Map<string, number>, least = 1): [string, number] | null => { let b: [string, number] | null = null; for (const e of m) if (!b || e[1] > b[1]) b = e; return b && b[1] >= least ? b : null; };
const round1 = (n: number) => Math.round(n * 10) / 10;

export function stats(chores: Chore[], finished: Done[], now: number, lastEnd: (id: number) => number | null = () => null) {
  const byId = new Map(chores.map((c) => [c.id, c]));
  const rows = finished.filter((r) => r.ended_at <= now).sort((a, b) => a.ended_at - b.ended_at);
  const late = lateness(rows, byId), streak = streaks(rows, now), first = new Map<string, number>(), names = new Map<string, string>();
  for (const r of rows) { first.set(keyOf(r), Math.min(first.get(keyOf(r)) ?? Infinity, r.started_at)); names.set(keyOf(r), r.owner_name || "Someone"); }
  const out: Record<string, any> = {};
  for (const period of STAT_PERIODS) {
    const all = period === "all_time", start = all ? Math.min(now, ...rows.map((r) => r.started_at)) : periodStart(period, now);
    const these = all ? rows : rows.filter((r) => r.ended_at >= start);
    const p: Record<string, any> = { start, ...summary(these) };
    if (!all) { const ps = periodStart(period, start - 1); p.before = summary(rows.filter((r) => r.ended_at >= ps && r.ended_at < ps + (now - start))); }
    const scored = these.filter((r) => late.has(r.id)).map((r) => late.get(r.id)!);
    p.on_time = scored.length ? Math.round((100 * scored.filter((d) => d <= 0).length) / scored.length) : null;
    p.scored = scored.length;
    p.avg_minutes = these.length ? Math.round(sum(these.map(mins)) / these.length) : null;
    p.new = all ? [] : [...new Set(these.filter((r) => first.get(keyOf(r))! >= start).map((r) => names.get(keyOf(r))!))].sort();
    p.timeline = buckets(period, start, now).map(([label, a, b]) => ({ label, hours: round1(sum(these.filter((r) => r.ended_at >= a && r.ended_at < b).map(mins)) / 60), ahead: a > now }));
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of these) { const d = lp(r.started_at); heat[d.wd][d.h] += Math.round(mins(r)); }
    p.heat = heat;

    const people = new Map<string, any>();
    for (const r of these) {
      const k = keyOf(r), h = lp(r.started_at).h;
      const m = people.get(k) ?? people.set(k, { who: names.get(k), minutes: 0, sessions: 0, byTask: new Map<number, number>(), longest: 0, rescues: 0, early: 0, late: 0, last_at: 0, new: !all && first.get(k)! >= start, streak: streak.get(k) ?? 0, since: first.get(k) }).get(k);
      m.minutes += mins(r); m.sessions++; m.byTask.set(r.chore_id, (m.byTask.get(r.chore_id) ?? 0) + 1);
      m.longest = Math.max(m.longest, mins(r)); m.rescues += (late.get(r.id) ?? 0) > 0 ? 1 : 0; m.early += h < EARLY ? 1 : 0; m.late += h >= LATE ? 1 : 0; m.last_at = Math.max(m.last_at, r.ended_at);
    }
    p.people = [...people.values()].map(({ byTask, minutes, ...m }) => {
      const fav = [...byTask].sort((a, b) => b[1] - a[1])[0];
      return { ...m, hours: round1(minutes / 60), favorite: byId.get(fav[0])?.name ?? "", favorite_times: fav[1], tasks: byTask.size, longest: Math.round(m.longest), _min: minutes };
    }).sort((a, b) => b._min - a._min).map(({ _min, ...m }) => m);

    p.tasks = [];
    for (const c of chores) {
      const mine = these.filter((r) => r.chore_id === c.id);
      if (!mine.length && !c.active) continue;
      const waits = mine.filter((r) => late.has(r.id)).map((r) => late.get(r.id)!), who = count(mine, keyOf), t = top(who);
      const visits = [...new Set(mine.map((r) => dayNum(r.ended_at)))].sort((a, b) => a - b), d = c.active ? dueAt(c, lastEnd(c.id)) : null;
      p.tasks.push({ id: c.id, name: c.name, every_days: c.every_days, active: c.active, done: mine.length, hours: round1(sum(mine.map(mins)) / 60),
        avg_minutes: mine.length ? Math.round(sum(mine.map(mins)) / mine.length) : null, people: who.size, top: t ? names.get(t[0]) : null, top_times: t?.[1] ?? 0,
        on_time: waits.length ? Math.round((100 * waits.filter((w) => w <= 0).length) / waits.length) : null, scored: waits.length,
        avg_wait: waits.length ? round1(sum(waits.map((w) => Math.max(0, w))) / waits.length) : null, longest_wait: waits.length ? Math.max(0, ...waits) : null,
        rhythm: visits.length > 1 ? round1((visits[visits.length - 1] - visits[0]) / (visits.length - 1)) : null, due_in: d ? daysBetween(now, d) : null });
    }
    p.tasks.sort((a: any, b: any) => b.done - a.done || a.name.localeCompare(b.name));
    p.awards = awards(rows, these, start, period, p, byId, names, late);
    out[period] = p;
  }
  return out;
}

/** The standouts, as facts for the page to put into words; each only when someone's earned it. `everything` is every shift (for comebacks, firsts and milestones). */
function awards(everything: Done[], rows: Done[], start: number, period: string, p: any, byId: Map<number, Chore>, names: Map<string, string>, late: Map<number, number>) {
  const out: Award[] = [], add = (kind: string, o: Record<string, unknown>) => out.push({ kind, ...o });
  const who = (k: string) => names.get(k)!, task = (r: Done) => byId.get(r.chore_id)?.name ?? "", timed = rows.filter((r) => r.minutes), people: any[] = p.people, at = (r: Done) => lp(r.started_at);
  const dkey = (r: Done) => dayNum(r.started_at);
  if (timed.length) { const r = timed.reduce((a, b) => (b.minutes! > a.minutes! ? b : a)); add("marathon", { who: who(keyOf(r)), task: task(r), minutes: Math.round(r.minutes!) }); }
  const avg = new Map<number, number>(p.tasks.filter((t: any) => t.done >= 3 && t.avg_minutes).map((t: any) => [t.id, t.avg_minutes]));
  const quick = timed.filter((r) => avg.has(r.chore_id) && r.minutes! < avg.get(r.chore_id)! * 0.75);
  if (quick.length) { const r = quick.reduce((a, b) => (b.minutes! / avg.get(b.chore_id)! < a.minutes! / avg.get(a.chore_id)! ? b : a)); add("speedrun", { who: who(keyOf(r)), task: task(r), minutes: Math.round(r.minutes!), usual: avg.get(r.chore_id) }); }
  for (const [kind, f] of [["rescuer", "rescues"], ["explorer", "tasks"], ["early", "early"], ["owl", "late"], ["streak", "streak"]] as const) {
    const best = people.reduce((a, b) => (!a || b[f] > a[f] ? b : a), null);
    if (best && best[f] >= (kind === "explorer" || kind === "streak" ? 2 : 1)) add(kind, { who: best.who, n: best[f] });
  }
  const loyal = people.reduce((a, b) => (!a || b.favorite_times > a.favorite_times ? b : a), null);
  if (loyal && loyal.favorite_times >= 3) add("loyal", { who: loyal.who, task: loyal.favorite, n: loyal.favorite_times });
  let t;
  if ((t = top(count(rows, (r) => keyOf(r) + "@" + dkey(r)), 2))) add("double", { who: who(t[0].split("@")[0]), n: t[1], at: dayStart(+t[0].split("@")[1]) });
  const perDay = new Map<string, Set<number>>();
  for (const r of rows) (perDay.get(keyOf(r) + "@" + dkey(r)) ?? perDay.set(keyOf(r) + "@" + dkey(r), new Set()).get(keyOf(r) + "@" + dkey(r))!).add(r.chore_id);
  if ((t = top(new Map([...perDay].map(([k, v]) => [k, v.size])), 3))) add("busy_bee", { who: who(t[0].split("@")[0]), n: t[1] });
  if ((t = top(count(rows, keyOf, (r) => at(r).wd >= 5), 2))) add("weekend", { who: who(t[0]), n: t[1] });
  if ((t = top(count(rows, keyOf, (r) => at(r).h >= 12 && at(r).h < 14), 2))) add("lunch", { who: who(t[0]), n: t[1] });
  const small = rows.filter((r) => at(r).h < 4);
  if (small.length) { const r = small[small.length - 1]; add("midnight", { who: who(keyOf(r)), task: task(r), at: r.started_at }); }
  if ((t = top(count(rows, keyOf, (r) => (late.get(r.id) ?? 1) <= 0), 3))) add("steady", { who: who(t[0]), n: t[1] });
  if ((t = top(count(rows, keyOf, (r) => (late.get(r.id) ?? 0) <= -1), 2))) add("ahead", { who: who(t[0]), n: t[1] });
  const rescued = rows.filter((r) => (late.get(r.id) ?? 0) >= 3);
  if (rescued.length) { const r = rescued.reduce((a, b) => (late.get(b.id)! > late.get(a.id)! ? b : a)); add("firefighter", { who: who(keyOf(r)), task: task(r), days: late.get(r.id) }); }
  const days = new Map<string, Set<number>>();
  for (const r of rows) (days.get(keyOf(r)) ?? days.set(keyOf(r), new Set()).get(keyOf(r))!).add(dkey(r));
  if ((t = top(new Map([...days].map(([k, v]) => [k, v.size])), 3))) add("regular", { who: who(t[0]), n: t[1] });
  if ((t = top(new Map([...days].map(([k, v]) => [k, run([...v])])), 3))) add("day_after_day", { who: who(t[0]), n: t[1] });
  const lens = new Map<string, number[]>();
  for (const r of timed) (lens.get(keyOf(r)) ?? lens.set(keyOf(r), []).get(keyOf(r))!).push(r.minutes!);
  const avgs = [...lens].filter(([, v]) => v.length >= 3).map(([k, v]) => [k, sum(v) / v.length] as const);
  if (avgs.length >= 2) {
    const lo = avgs.reduce((a, b) => (b[1] < a[1] ? b : a)), hi = avgs.reduce((a, b) => (b[1] > a[1] ? b : a));
    add("in_and_out", { who: who(lo[0]), minutes: Math.round(lo[1]) }); add("deep_focus", { who: who(hi[0]), minutes: Math.round(hi[1]) });
  }
  if ((t = top(count(rows, keyOf, (r) => !byId.get(r.chore_id)?.every_days), 3))) add("unsung", { who: who(t[0]), n: t[1] });
  const active = new Set([...byId.values()].filter((c) => c.active).map((c) => c.id));
  if (active.size >= 3) {
    const did = new Map<string, Set<number>>();
    for (const r of rows) (did.get(keyOf(r)) ?? did.set(keyOf(r), new Set()).get(keyOf(r))!).add(r.chore_id);
    const swept = [...did].filter(([, v]) => [...active].every((a) => v.has(a))).map(([k]) => k);
    if (swept.length) add("clean_sweep", { who: who(swept.reduce((a, b) => (sum(rows.filter((r) => keyOf(r) === b).map(mins)) > sum(rows.filter((r) => keyOf(r) === a).map(mins)) ? b : a))), n: active.size });
  }
  const holiday = rows.filter((r) => HOLIDAYS.has(`${at(r).m}-${at(r).d}`));
  if (holiday.length) { const r = holiday[holiday.length - 1]; add("holiday", { who: who(keyOf(r)), task: task(r), at: r.started_at }); }
  if (period !== "all_time") {
    if (rows.length) { const r = rows.reduce((a, b) => (b.started_at < a.started_at ? b : a)); add("opening_act", { who: who(keyOf(r)), task: task(r), at: r.started_at }); }
    const rookie = people.find((m) => m.new);
    if (rookie) add("rookie", { who: rookie.who, hours: rookie.hours });
  }
  const last = new Map<string, number>(), gap = new Map<string, number>();
  for (const r of everything) {
    const k = keyOf(r);
    if (last.has(k) && r.ended_at >= start) { const d = daysBetween(last.get(k)!, r.started_at); if (d >= 30 && d > (gap.get(k) ?? 0)) gap.set(k, d); }
    last.set(k, r.ended_at);
  }
  if ((t = top(gap))) add("comeback", { who: who(t[0]), days: t[1] });

  // teamwork
  const onDay = new Map<string, Set<string>>();
  for (const r of rows) (onDay.get(r.chore_id + "@" + dkey(r)) ?? onDay.set(r.chore_id + "@" + dkey(r), new Set()).get(r.chore_id + "@" + dkey(r))!).add(keyOf(r));
  const pairs = new Map<string, number>();
  for (const s of onDay.values()) { const ks = [...s].sort(); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) pairs.set(ks[i] + "|" + ks[j], (pairs.get(ks[i] + "|" + ks[j]) ?? 0) + 1); }
  if ((t = top(pairs, 2))) { const [a, b] = t[0].split("|"); add("tag_team", { who: who(a), who2: who(b), n: t[1] }); }
  const crowd = new Map<number, Done[]>();
  for (const r of rows) (crowd.get(dkey(r)) ?? crowd.set(dkey(r), []).get(dkey(r))!).push(r);
  if (crowd.size) {
    const [d, rs] = [...crowd].reduce((a, b) => { const na = new Set(a[1].map(keyOf)).size, nb = new Set(b[1].map(keyOf)).size; return nb > na || (nb === na && sum(b[1].map(mins)) > sum(a[1].map(mins))) ? b : a; });
    if (new Set(rs.map(keyOf)).size >= 3) add("barn_raising", { n: new Set(rs.map(keyOf)).size, hours: round1(sum(rs.map(mins)) / 60), at: dayStart(d) });
  }

  // milestones: lifetime hours clubs, the space's big round shifts, and firsts
  const total = new Map<string, number>(), clubs = new Map<string, number>();
  for (const r of everything) {
    const k = keyOf(r), before = total.get(k) ?? 0;
    total.set(k, before + mins(r) / 60);
    if (r.ended_at >= start) for (const c of CLUBS) if (before < c && c <= total.get(k)!) clubs.set(k, c);
  }
  for (const [k, c] of [...clubs].sort((a, b) => b[1] - a[1]).slice(0, 3)) add("club", { who: who(k), n: c });
  const marks = everything.map((r, i) => [i + 1, r] as const).filter(([i, r]) => SHIFT_MARKS.includes(i) && r.ended_at >= start);
  if (marks.length) { const [i, r] = marks[marks.length - 1]; add("big_shift", { who: who(keyOf(r)), task: task(r), n: i }); }
  const firsts = new Map<number, Done>();
  for (const r of everything) if (!firsts.has(r.chore_id)) firsts.set(r.chore_id, r);
  for (const r of [...firsts.values()].filter((r) => r.ended_at >= start).sort((a, b) => b.ended_at - a.ended_at).slice(0, 3)) add("trailblazer", { who: who(keyOf(r)), task: task(r) });

  // the chores themselves
  const waited = p.tasks.filter((t: any) => t.avg_wait);
  if (waited.length) { const c = waited.reduce((a: any, b: any) => (b.avg_wait > a.avg_wait ? b : a)); add("neglected", { task: c.name, days: c.avg_wait, longest: c.longest_wait }); }
  const steady = p.tasks.filter((t: any) => t.scored >= 3 && t.on_time !== null);
  if (steady.length) { const c = steady.reduce((a: any, b: any) => (b.on_time > a.on_time || (b.on_time === a.on_time && b.scored > a.scored) ? b : a)); add("clockwork", { task: c.name, pct: c.on_time, n: c.scored }); }
  const crowded = p.tasks.filter((t: any) => t.people >= 3);
  if (crowded.length) { const c = crowded.reduce((a: any, b: any) => (b.people > a.people ? b : a)); add("crowd_favorite", { task: c.name, n: c.people }); }
  for (const c of p.tasks.filter((t: any) => t.done >= 3 && t.people === 1).slice(0, 2)) add("solo", { who: c.top, task: c.name, n: c.done });
  return out;
}

// ---- achievements: stewards set a goal on a chore, and whoever reaches it earns a title
export const MEASURES: Record<string, string> = { times: "times done", hours: "hours given", on_time: "on-time visits", rescues: "overdue rescues", days: "different days" };
export type Achievement = { id: number; chore_id: number | null; measure: string; goal: number; title: string; icon: string; note: string };

export function achievements(chores: Chore[], finished: Done[], list: Achievement[], now: number) {
  const byId = new Map(chores.map((c) => [c.id, c])), rows = finished.filter((r) => r.ended_at <= now).sort((a, b) => a.ended_at - b.ended_at), late = lateness(rows, byId);
  return list.map((a) => {
    const have = new Map<string, number>(), days = new Map<string, Set<number>>(), names = new Map<string, string>(), earned: { who: string; at: number; log_id: number }[] = [];
    for (const r of rows) {
      if (a.chore_id && r.chore_id !== a.chore_id) continue;
      const k = keyOf(r), seen = days.get(k) ?? days.set(k, new Set()).get(k)!;
      names.set(k, r.owner_name || "Someone");
      let gain = 1;
      if (a.measure === "hours") gain = mins(r) / 60;
      else if (a.measure === "on_time") gain = (late.get(r.id) ?? 1) <= 0 ? 1 : 0;
      else if (a.measure === "rescues") gain = (late.get(r.id) ?? 0) > 0 ? 1 : 0;
      else if (a.measure === "days") { const d = dayNum(r.started_at); gain = seen.has(d) ? 0 : 1; seen.add(d); }
      if (!gain) continue;
      const before = have.get(k) ?? 0;
      have.set(k, before + gain);
      if (before < a.goal && a.goal <= before + gain) earned.push({ who: names.get(k)!, at: r.ended_at, log_id: r.id });
    }
    const close = [...have].filter(([, v]) => v < a.goal).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => ({ who: names.get(k)!, have: round1(v) }));
    return { ...a, task: a.chore_id ? byId.get(a.chore_id)?.name ?? null : null, earned, close };
  });
}

// ---- names
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** 0..1 for how alike two names sound written down; a single word is compared to a first name too. */
export function nameScore(said: string, member: string) {
  const a = norm(said), b = norm(member);
  if (!a || !b) return 0;
  const s = (x: string, y: string) => 1 - lev(x, y) / Math.max(x.length, y.length);
  return a.includes(" ") ? s(a, b) : Math.max(s(a, b.split(" ")[0]) * 0.9, s(a, b) * 0.9);
}
/** Who a spoken name is: the full name, else a first name only one member has, else the near matches for a human (or JEV) to judge. */
export function matchMember(said: string, members: { id: number; name: string }[]) {
  const a = norm(said);
  const exact = members.filter((m) => norm(m.name) === a);
  if (exact.length === 1) return { status: "match" as const, how: "full", member: exact[0] };
  if (exact.length > 1) return { status: "ambiguous" as const, candidates: exact };
  if (a && !a.includes(" ")) {
    const first = members.filter((m) => norm(m.name).split(" ")[0] === a);
    if (first.length === 1) return { status: "match" as const, how: "first", member: first[0] };
    if (first.length > 1) return { status: "ambiguous" as const, candidates: first };
  }
  const near = members.map((m) => ({ ...m, score: Math.round(nameScore(said, m.name) * 100) / 100 })).filter((m) => m.score >= 0.6).sort((x, y) => y.score - x.score).slice(0, 5);
  return near.length ? { status: "maybe" as const, candidates: near } : { status: "none" as const };
}
