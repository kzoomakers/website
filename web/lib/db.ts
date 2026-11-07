import { Pool } from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";
import boardSeed from "@/data/board.json";
import { getConfig, type Cfg } from "./config";

/** Pages managed by their own admin screen: not listed, not editable in Puck. */
export const LOCKED = ["index", "sitemap", "calendar", "board", "team", "history", "pricing", "handbook", "about", "contact", "other-makerspaces", "laser-shop", "wood-shop", "metal-shop", "3d-printing", "craft-room-kalamazoo", "meeting-space", "what_is_a_makerspace", "why-kzoo-makers", "how-to", "tools-we-are-seeking-donations-kalamazoo"];
const GUIDED_SEEDS = ["index", "team", "history", "pricing", "handbook", "about", "contact", "other-makerspaces", "laser-shop", "wood-shop", "metal-shop", "3d-printing", "craft-room-kalamazoo", "meeting-space", "what_is_a_makerspace", "why-kzoo-makers", "how-to", "tools-we-are-seeking-donations-kalamazoo"];
export const CAL_DEFAULT = "https://calendar.google.com/calendar/ical/kzoomakers.org_fkmebp59ti7pvl271vp65p1k8s%40group.calendar.google.com/public/basic.ics";

export const poolFor = (c: Pick<Cfg, "databaseUrl" | "databaseCa">) =>
  new Pool({ connectionString: c.databaseUrl, ssl: c.databaseCa ? { ca: c.databaseCa } : undefined, connectionTimeoutMillis: 5000 });

// Creates the table and, if it is brand new/empty, loads the migrated pages from data/pages.
export async function ensureSchema(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS pages (
    slug text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, data jsonb NOT NULL)");
  // Audit log; rows with `data` (menu snapshots) double as revision history.
  await pool.query(`CREATE TABLE IF NOT EXISTS audit (id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL, action text NOT NULL, target text NOT NULL DEFAULT '', data jsonb)`);
  // Every page version (and the final version of deleted pages) for history, revert and restore.
  await pool.query(`CREATE TABLE IF NOT EXISTS page_revisions (id serial PRIMARY KEY, slug text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL, action text NOT NULL, target text NOT NULL DEFAULT '', data jsonb NOT NULL)`);
  await pool.query("ALTER TABLE page_revisions ADD COLUMN IF NOT EXISTS menu jsonb"); // menu links removed along with a deleted page
  await pool.query("CREATE INDEX IF NOT EXISTS page_revisions_slug ON page_revisions (slug, id DESC)");
  // First start: stage the built-in board and calendar link in Postgres (plus a baseline revision to roll back to). Admin screens replace them.
  for (const [key, data, action] of [["board", boardSeed, "board.import"], ["calendar", { url: CAL_DEFAULT }, "calendar.import"],
    ...(await Promise.all(GUIDED_SEEDS.map(async (g) => [`guided:${g}`, JSON.parse(await readFile(path.join(process.cwd(), "data", "guided", g + ".json"), "utf8")), `guided.${g}.import`] as const)))] as const)
    if ((await pool.query("INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT DO NOTHING", [key, JSON.stringify(data)])).rowCount)
      await pool.query("INSERT INTO audit (actor, action, target, data) VALUES ('system', $1, 'initial', $2)", [action, JSON.stringify(data)]);
  // Locked pages are not editable in Puck, so their files are the source of truth on every start.
  for (const slug of LOCKED) await pool.query("INSERT INTO pages (slug, data) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET data = EXCLUDED.data", [slug, await readFile(path.join(process.cwd(), "data", "pages", slug + ".json"), "utf8")]);
  if ((await pool.query("SELECT 1 FROM pages WHERE slug <> ALL($1) LIMIT 1", [LOCKED])).rowCount) return;
  const dir = path.join(process.cwd(), "data", "pages");
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    await pool.query("INSERT INTO pages (slug, data) VALUES ($1, $2) ON CONFLICT DO NOTHING", [decodeURIComponent(f.slice(0, -5)), await readFile(path.join(dir, f), "utf8")]);
  }
}

const g = globalThis as unknown as { db?: { key: string; pool: Pool; ready: Promise<unknown> } };

/** Pool for the current config, or null if setup has not run. Rebuilt when the config changes. */
export function db(): { pool: Pool; ready: Promise<unknown> } | null {
  const c = getConfig();
  if (!c) return null;
  const key = JSON.stringify([c.databaseUrl, c.databaseCa]);
  if (g.db?.key !== key) {
    g.db?.pool.end().catch(() => {});
    const pool = poolFor(c);
    // A failed init (bad creds, db down) must not stick: drop the cache so the next request retries.
    const ready = ensureSchema(pool).catch((e) => { if (g.db?.pool === pool) g.db = undefined; throw e; });
    g.db = { key, pool, ready };
  }
  return g.db;
}
