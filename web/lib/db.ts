import { Pool } from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";
import boardSeed from "@/data/board.json";
import { getConfig, type Cfg } from "./config";

/** Pages managed by their own admin screen: not listed, not editable in Puck. */
export const LOCKED = ["index", "sitemap", "calendar", "board", "team", "history", "pricing", "handbook", "about", "contact", "other-makerspaces", "laser-shop", "wood-shop", "metal-shop", "3d-printing", "craft-room-kalamazoo", "meeting-space", "what_is_a_makerspace", "why-kzoo-makers", "how-to", "tools-we-are-seeking-donations-kalamazoo", "board-contact"];
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
  await pool.query(`CREATE TABLE IF NOT EXISTS posts (id serial PRIMARY KEY, slug text UNIQUE NOT NULL, title text NOT NULL, excerpt text NOT NULL DEFAULT '',
    body text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft',
    publish_at timestamptz, author text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_id int, ADD COLUMN IF NOT EXISTS category_ids int[] NOT NULL DEFAULT '{}'");
  await pool.query(`CREATE TABLE IF NOT EXISTS authors (id serial PRIMARY KEY, name text NOT NULL, email text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS categories (id serial PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS media (id serial PRIMARY KEY, key text UNIQUE NOT NULL, filename text NOT NULL DEFAULT '', mime text NOT NULL DEFAULT '', size int NOT NULL DEFAULT 0,
    alt text NOT NULL DEFAULT '', uploader text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
  // Blog readers: passwordless accounts (email link), and the one-time links themselves (stored hashed).
  await pool.query(`CREATE TABLE IF NOT EXISTS site_users (id serial PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS password_hash text"); // optional: scrypt "salt:hash"; accounts without one sign in by emailed link only
  // Member details. `name` stays the display name (first + last); the rest is kept by the member and by admins (card number, QuickBooks id, notes are admin-only).
  for (const col of ["first_name", "last_name", "phone", "address1", "address2", "city", "state", "zip", "access_card_number", "qb_id", "notes"])
    await pool.query(`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS ${col} text NOT NULL DEFAULT ''`);
  await pool.query(`UPDATE site_users SET first_name = split_part(name, ' ', 1), last_name = btrim(substr(name, length(split_part(name, ' ', 1)) + 1)) WHERE first_name = '' AND last_name = ''`);
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS disabled_at timestamptz, ADD COLUMN IF NOT EXISTS disabled_reason text NOT NULL DEFAULT ''"); // disabled = cannot sign in; the reason is what they are told
  // Members area: membership levels (names of the plans on the Pricing page), the skills directory, tool authorizations and classes.
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS directory_optin boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS photo text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS show_phone boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS show_email boolean NOT NULL DEFAULT false");
  await pool.query("CREATE TABLE IF NOT EXISTS memberships (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, level text NOT NULL, since timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, level))");
  await pool.query("CREATE TABLE IF NOT EXISTS skills (id serial PRIMARY KEY, name text NOT NULL)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS skills_name ON skills ((lower(name)))");
  await pool.query(`CREATE TABLE IF NOT EXISTS member_skills (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, skill_id int NOT NULL REFERENCES skills ON DELETE CASCADE,
    level text NOT NULL DEFAULT 'competent' CHECK (level IN ('learning','competent','teach')), note text NOT NULL DEFAULT '', PRIMARY KEY (user_id, skill_id))`);
  await pool.query("CREATE TABLE IF NOT EXISTS member_fields (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, field text NOT NULL, value text NOT NULL, PRIMARY KEY (user_id, field, value))"); // profile facts (occupation, company, interests…); see FIELDS in crm.ts
  await pool.query("CREATE TABLE IF NOT EXISTS member_messages (id serial PRIMARY KEY, from_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, to_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, at timestamptz NOT NULL DEFAULT now())");
  await pool.query("ALTER TABLE member_messages ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS read_at timestamptz"); // in-app conversations; older rows have no body and are ignored
  await pool.query("CREATE INDEX IF NOT EXISTS member_messages_to ON member_messages (to_id, from_id)");
  await pool.query("CREATE TABLE IF NOT EXISTS tools (id serial PRIMARY KEY, name text NOT NULL, category text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '')");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS tools_name ON tools ((lower(name)))");
  await pool.query(`CREATE TABLE IF NOT EXISTS tool_auths (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, tool_id int NOT NULL REFERENCES tools ON DELETE CASCADE,
    granted_by text NOT NULL DEFAULT '', granted_at timestamptz NOT NULL DEFAULT now(), expires_on date, note text NOT NULL DEFAULT '', PRIMARY KEY (user_id, tool_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS classes (id serial PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '', starts_at timestamptz NOT NULL, ends_at timestamptz,
    location text NOT NULL DEFAULT '', instructor text NOT NULL DEFAULT '', capacity int NOT NULL DEFAULT 0, price text NOT NULL DEFAULT '', cancelled boolean NOT NULL DEFAULT false)`);
  await pool.query("ALTER TABLE classes ADD COLUMN IF NOT EXISTS image text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'all', ADD COLUMN IF NOT EXISTS prerequisites text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS materials text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT ''");
  // A member's pitch to teach a class; a CRM admin approves it (which creates the class) or declines it with a reason.
  await pool.query(`CREATE TABLE IF NOT EXISTS class_proposals (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, title text NOT NULL, summary text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '', level text NOT NULL DEFAULT 'all', duration_min int NOT NULL DEFAULT 120, capacity int NOT NULL DEFAULT 0, price text NOT NULL DEFAULT '', materials text NOT NULL DEFAULT '',
    prerequisites text NOT NULL DEFAULT '', starts_at timestamptz NOT NULL, location text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending',
    reason text NOT NULL DEFAULT '', class_id int REFERENCES classes ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by text NOT NULL DEFAULT '')`);
  await pool.query("CREATE INDEX IF NOT EXISTS class_proposals_status ON class_proposals (status, id DESC)");
  await pool.query("CREATE TABLE IF NOT EXISTS class_signups (class_id int NOT NULL REFERENCES classes ON DELETE CASCADE, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (class_id, user_id))");
  await pool.query(`CREATE TABLE IF NOT EXISTS emergency_contacts (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE,
    first_name text NOT NULL, last_name text NOT NULL, phone text NOT NULL, relationship text NOT NULL, address text NOT NULL DEFAULT '', business_phone text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("CREATE INDEX IF NOT EXISTS emergency_contacts_user ON emergency_contacts (user_id)");
  await pool.query("CREATE TABLE IF NOT EXISTS login_fails (email text NOT NULL, at timestamptz NOT NULL DEFAULT now())");
  await pool.query(`CREATE TABLE IF NOT EXISTS login_tokens (hash text PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, next text NOT NULL DEFAULT '/blog',
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS reset boolean NOT NULL DEFAULT false"); // an admin-sent password reset link
  // Admin RBAC: one row per (user, top-level admin section). No row = no access. admin:write = full admin (and may grant access).
  await pool.query(`CREATE TABLE IF NOT EXISTS user_perms (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, section text NOT NULL,
    level text NOT NULL CHECK (level IN ('read','write')), PRIMARY KEY (user_id, section))`);
  await pool.query("ALTER TABLE user_perms ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false"); // the founding admin: never changeable
  await pool.query(`CREATE TABLE IF NOT EXISTS comments (id serial PRIMARY KEY, post_id int NOT NULL REFERENCES posts ON DELETE CASCADE, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE,
    body text NOT NULL, hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("CREATE INDEX IF NOT EXISTS comments_post ON comments (post_id, id)");
  // Threading (parent_id, unlimited depth; deleting a comment removes its replies), moderation state, abuse signals, and likes.
  await pool.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id int REFERENCES comments ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved', ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS ip_hash text NOT NULL DEFAULT ''`);
  await pool.query("UPDATE comments SET status = 'hidden', hidden = false WHERE hidden"); // the old hidden flag is now a status
  await pool.query("CREATE INDEX IF NOT EXISTS comments_parent ON comments (parent_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS comments_ip ON comments (ip_hash, created_at)");
  // Homepage review submissions from signed-in readers; an admin approves (copying it into the homepage roster), edits or rejects.
  await pool.query(`CREATE TABLE IF NOT EXISTS review_submissions (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, name text NOT NULL, role text NOT NULL DEFAULT '',
    text text NOT NULL, status text NOT NULL DEFAULT 'pending', reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by text NOT NULL DEFAULT '')`);
  await pool.query("ALTER TABLE review_submissions ADD COLUMN IF NOT EXISTS photo text NOT NULL DEFAULT ''");
  await pool.query(`CREATE TABLE IF NOT EXISTS comment_likes (comment_id int NOT NULL REFERENCES comments ON DELETE CASCADE, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, PRIMARY KEY (comment_id, user_id))`);
  // Generic in-app notifications (blog replies today); the envelope in the members top bar reads these.
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, kind text NOT NULL,
    title text NOT NULL, body text NOT NULL DEFAULT '', url text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz)`);
  await pool.query("CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, id DESC)");
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
