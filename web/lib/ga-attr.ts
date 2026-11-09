import { db } from "./db";
import { publicTag } from "./ga";
import { classify } from "./referrers-util";

// Which source brings the people who book a tour, write to us or sign up? After a visitor accepts cookies, the public site remembers where they first arrived from
// in a cookie called "ft" (90 days: the referring site or utm_source, nothing else). When they book, write or sign up we store one row: what they did and that source.
// No name, email, IP or id is stored with it. Visitors who did not accept cookies are counted with an empty source ("not known").
export const KINDS = { tour: "Tour booked or requested", contact: "Contact form", subscribe: "Newsletter signup" } as const;
export type Kind = keyof typeof KINDS;
const SRC = /^[a-z0-9._-]{1,60}$/;

let ready: Promise<unknown> | undefined;
async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  ready ??= d.pool.query("CREATE TABLE IF NOT EXISTS ga_conversions (at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL, source text NOT NULL DEFAULT ''); CREATE INDEX IF NOT EXISTS ga_conversions_at ON ga_conversions (at)").catch((e) => { ready = undefined; throw e; });
  await ready;
  return d.pool;
}

/** The source in the "ft" cookie, or "" when it is missing or not a plain hostname-like word. */
export function sourceOf(cookie: string | null) {
  const v = /(?:^|;\s*)ft=([^;]*)/.exec(cookie ?? "")?.[1] ?? "";
  return SRC.test(v) ? v : "";
}

/** Called after a successful booking, message or signup. Never throws: counting must not break the form. Does nothing while Google Analytics is off. */
export async function convert(req: Request, kind: Kind) {
  try {
    if (!(await publicTag()).id) return;
    await (await pool()).query("INSERT INTO ga_conversions (kind, source) VALUES ($1, $2)", [kind, sourceOf(req.headers.get("cookie"))]);
  } catch (e) { console.error("conversion not counted:", e); }
}

/** Per kind: the total and the biggest sources (a source of "" is "not known"). Pure. */
export function group(rows: { kind: string; source: string; n: number }[]) {
  return (Object.keys(KINDS) as Kind[]).map((kind) => {
    const mine = rows.filter((r) => r.kind === kind), by = mine.filter((r) => r.source).sort((a, b) => b.n - a.n);
    return { kind, label: KINDS[kind], total: mine.reduce((a, r) => a + r.n, 0), unknown: mine.find((r) => !r.source)?.n ?? 0, sources: by.slice(0, 6).map((r) => ({ source: r.source, type: r.source === "direct" ? "direct" : classify(`https://${r.source}/`, r.source, "")?.kind ?? "other", n: r.n })) };
  });
}

export async function conversions(from: Date, to: Date) {
  const rows = (await (await pool()).query("SELECT kind, source, count(*)::int AS n FROM ga_conversions WHERE at >= $1 AND at < $2 GROUP BY 1, 2", [from, to])).rows;
  return group(rows);
}
