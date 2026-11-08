import { Pool } from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";
import boardSeed from "@/data/board.json";
import waiverSeed from "@/data/waiver-2025.1.json";
import { getConfig, pgConnection, type Cfg } from "./config";

/** Pages managed by their own admin screen: not listed, not editable in Puck. */
export const LOCKED = ["index", "sitemap", "calendar", "board", "team", "history", "pricing", "handbook", "about", "contact", "other-makerspaces", "laser-shop", "wood-shop", "metal-shop", "3d-printing", "craft-room-kalamazoo", "meeting-space", "what_is_a_makerspace", "why-kzoo-makers", "how-to", "tools-we-are-seeking-donations-kalamazoo", "board-contact"];
const GUIDED_SEEDS = ["index", "team", "history", "pricing", "handbook", "about", "contact", "other-makerspaces", "laser-shop", "wood-shop", "metal-shop", "3d-printing", "craft-room-kalamazoo", "meeting-space", "what_is_a_makerspace", "why-kzoo-makers", "how-to", "tools-we-are-seeking-donations-kalamazoo"];
export const CAL_DEFAULT = "https://calendar.google.com/calendar/ical/kzoomakers.org_fkmebp59ti7pvl271vp65p1k8s%40group.calendar.google.com/public/basic.ics";

export const poolFor = (c: Pick<Cfg, "databaseUrl" | "databaseCa">) =>
  new Pool({ ...pgConnection(c), connectionTimeoutMillis: 5000 });

// Creates the table and, if it is brand new/empty, loads the migrated pages from data/pages.
export async function ensureSchema(pool: Pool) {
  // One process migrates at a time: a second one starting together waits here, then finds everything already done (the welcomed_at backfill must run once).
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(7351902)");
    await migrate(pool);
  } finally {
    await lock.query("SELECT pg_advisory_unlock(7351902)").catch(() => {});
    lock.release();
  }
}

async function migrate(pool: Pool) {
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
  // When the page was made (sitemap "new page" boost). Pages that existed before this column count as old: their first revision is only the baseline saved at the first edit, not their creation.
  await pool.query("ALTER TABLE pages ADD COLUMN IF NOT EXISTS created_at timestamptz");
  await pool.query(`UPDATE pages p SET created_at = COALESCE((SELECT min(at) FROM page_revisions r WHERE r.slug = p.slug AND NOT EXISTS (SELECT 1 FROM page_revisions i WHERE i.slug = p.slug AND i.action = 'page.import')), '2000-01-01') WHERE created_at IS NULL`);
  await pool.query("ALTER TABLE pages ALTER COLUMN created_at SET DEFAULT now()");
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
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS directory_optin boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS photo text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS show_phone boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS show_email boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS discord text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS show_discord boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS socials jsonb NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS show_socials boolean NOT NULL DEFAULT true");
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
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS session_version int NOT NULL DEFAULT 0");
  // welcomed_at: set when they finish the welcome wizard. Added with every approved member already through onboarding counted as welcomed (people still waiting for approval are not), so only new approvals see it.
  await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'site_users' AND column_name = 'welcomed_at') THEN ALTER TABLE site_users ADD COLUMN welcomed_at timestamptz; UPDATE site_users SET welcomed_at = now() WHERE onboarding = 'done' AND approval = 'approved'; END IF; END $$");
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS member_listed_at timestamptz"); // set once, when they first join the Members mailing list; an admin removing them later sticks
  await pool.query("CREATE TABLE IF NOT EXISTS login_fails (email text NOT NULL, at timestamptz NOT NULL DEFAULT now())");
  await pool.query("ALTER TABLE login_fails ADD COLUMN IF NOT EXISTS ip text NOT NULL DEFAULT ''"); // lockouts are per address + visitor, so a stranger can't lock someone out
  await pool.query("CREATE TABLE IF NOT EXISTS rate_hits (key text NOT NULL, at timestamptz NOT NULL DEFAULT now())"); // lib/limit.ts
  await pool.query("CREATE INDEX IF NOT EXISTS rate_hits_key ON rate_hits (key, at)");
  await pool.query(`CREATE TABLE IF NOT EXISTS login_tokens (hash text PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, next text NOT NULL DEFAULT '/blog',
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS reset boolean NOT NULL DEFAULT false"); // an admin-sent password reset link
  // Sign-up approval. New accounts start 'pending' (existing ones are 'approved'); staff move them between pending / waiting (for the applicant's reply) / rejected / approved.
  // approval_events is the dialog thread: messages both ways, staff-only notes, and every state change with who did it.
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS approval text NOT NULL DEFAULT 'approved' CHECK (approval IN ('pending','waiting','rejected','approved'))");
  await pool.query("UPDATE site_users SET approval = 'pending' WHERE verified_at IS NULL AND approval = 'approved'"); // never-verified sign-ups must not skip the queue by verifying later
  await pool.query(`CREATE TABLE IF NOT EXISTS approval_events (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, actor text NOT NULL, by_applicant boolean NOT NULL DEFAULT false,
    kind text NOT NULL CHECK (kind IN ('message','note','state')), to_state text, body text NOT NULL DEFAULT '', at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("CREATE INDEX IF NOT EXISTS approval_events_user ON approval_events (user_id, id)");
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
  // Member onboarding after approval: waiver -> handbook -> photo ID -> done. Existing members stay 'done'.
  await pool.query("ALTER TABLE site_users ADD COLUMN IF NOT EXISTS onboarding text NOT NULL DEFAULT 'done' CHECK (onboarding IN ('waiver','handbook','id','done'))");
  // Photo IDs, AES-256-GCM encrypted before they reach the database (see lib/vault.ts).
  await pool.query("CREATE TABLE IF NOT EXISTS member_ids (user_id int PRIMARY KEY REFERENCES site_users ON DELETE CASCADE, kind text NOT NULL, expires_on date, data bytea NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now())");
  // Public financial PDFs (one per year; replacing keeps the first upload date).
  await pool.query("CREATE TABLE IF NOT EXISTS financials (year int PRIMARY KEY, filename text NOT NULL, data bytea NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(), replaced_at timestamptz)");
  // E-signature documents (member waivers and board papers). `pdf` is the final signed PDF, encrypted. Signer links are emailed; only their hash is stored.
  await pool.query("CREATE TABLE IF NOT EXISTS sign_buckets (id serial PRIMARY KEY, name text NOT NULL)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS sign_buckets_name ON sign_buckets ((lower(name)))");
  await pool.query(`CREATE TABLE IF NOT EXISTS sign_docs (id serial PRIMARY KEY, kind text NOT NULL DEFAULT 'board', user_id int REFERENCES site_users ON DELETE SET NULL, bucket_id int REFERENCES sign_buckets ON DELETE SET NULL,
    title text NOT NULL, body text NOT NULL, tags text[] NOT NULL DEFAULT '{}', present text[] NOT NULL DEFAULT '{}', needed int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','complete','void','expired')),
    due_at timestamptz, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, sha text NOT NULL DEFAULT '', pdf bytea)`);
  await pool.query("CREATE INDEX IF NOT EXISTS sign_docs_kind ON sign_docs (kind, id DESC)");
  await pool.query(`CREATE TABLE IF NOT EXISTS sign_signers (id serial PRIMARY KEY, doc_id int NOT NULL REFERENCES sign_docs ON DELETE CASCADE, name text NOT NULL, email text NOT NULL, token text NOT NULL,
    sent_at timestamptz, signed_at timestamptz, signature text NOT NULL DEFAULT '', drawn text NOT NULL DEFAULT '', ip text NOT NULL DEFAULT '', ua text NOT NULL DEFAULT '', declined_at timestamptz, decline_reason text NOT NULL DEFAULT '')`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS sign_signers_token ON sign_signers (token)");
  // The membership agreement/waiver, one immutable row per published version (kept forever for review). `mandatory` = every member must sign this version; `summary` is the plain-language "what changed".
  await pool.query(`CREATE TABLE IF NOT EXISTS waiver_versions (id serial PRIMARY KEY, revision text NOT NULL UNIQUE, title text NOT NULL, sections jsonb NOT NULL, closing text NOT NULL DEFAULT '',
    summary text NOT NULL DEFAULT '', mandatory boolean NOT NULL DEFAULT false, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query("ALTER TABLE sign_docs ADD COLUMN IF NOT EXISTS version_id int REFERENCES waiver_versions");
  await pool.query("ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS initials text NOT NULL DEFAULT ''");
  // Uploaded PDFs with placed fields, recipient roles/order/access, per-document customisation, and reusable templates (all additive; text-only papers keep working).
  for (const q of [
    "ALTER TABLE sign_docs ADD COLUMN IF NOT EXISTS source bytea", // the uploaded PDF, encrypted
    "ALTER TABLE sign_docs ADD COLUMN IF NOT EXISTS message text NOT NULL DEFAULT ''",
    "ALTER TABLE sign_docs ADD COLUMN IF NOT EXISTS redirect_url text NOT NULL DEFAULT ''",
    "ALTER TABLE sign_docs ADD COLUMN IF NOT EXISTS hide_audit boolean NOT NULL DEFAULT false",
    "ALTER TABLE sign_docs ADD COLUMN IF NOT EXISTS sequential boolean NOT NULL DEFAULT false",
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'signer'", // signer | approver | viewer | cc
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS ord int NOT NULL DEFAULT 1",
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS pw_hash text NOT NULL DEFAULT ''",
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS verify_email boolean NOT NULL DEFAULT false",
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS code_hash text NOT NULL DEFAULT ''",
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS code_exp timestamptz",
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS tries int NOT NULL DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS sign_fields (id serial PRIMARY KEY, doc_id int NOT NULL REFERENCES sign_docs ON DELETE CASCADE, signer_id int NOT NULL REFERENCES sign_signers ON DELETE CASCADE,
      type text NOT NULL, page int NOT NULL, x real NOT NULL, y real NOT NULL, w real NOT NULL, h real NOT NULL, label text NOT NULL DEFAULT '', options text[] NOT NULL DEFAULT '{}', required boolean NOT NULL DEFAULT true, value text NOT NULL DEFAULT '')`,
    "CREATE INDEX IF NOT EXISTS sign_fields_doc ON sign_fields (doc_id)",
    "ALTER TABLE sign_signers ADD COLUMN IF NOT EXISTS viewed_at timestamptz",
    "CREATE TABLE IF NOT EXISTS sign_contacts (email text PRIMARY KEY, name text NOT NULL, last_used timestamptz NOT NULL DEFAULT now())", // remembered for 6 months after last use
    // A template is the whole setup of a paper (text or PDF, recipients, fields, options). recipients/fields are JSON; a recipient with a blank email is a slot a public-link visitor fills.
    `CREATE TABLE IF NOT EXISTS sign_templates (id serial PRIMARY KEY, title text NOT NULL, body text NOT NULL DEFAULT '', source bytea, setup jsonb NOT NULL, direct_token text UNIQUE, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`,
  ]) await pool.query(q);
  await pool.query("INSERT INTO waiver_versions (revision, title, sections, closing, summary, created_by) SELECT $1,$2,$3,$4,'First version (imported from the paper agreement).','system' WHERE NOT EXISTS (SELECT 1 FROM waiver_versions)",
    [waiverSeed.revision, waiverSeed.title, JSON.stringify(waiverSeed.sections), waiverSeed.closing]);
  // Debug trap: only filled while a stream is switched on in Admin > Debug (see lib/debug.ts).
  await pool.query("CREATE TABLE IF NOT EXISTS debug_log (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), stream text NOT NULL, level text NOT NULL DEFAULT 'info', message text NOT NULL, data jsonb)");
  await pool.query("CREATE INDEX IF NOT EXISTS debug_log_stream ON debug_log (stream, id DESC)");
  // Optional: trigram indexes make the admin '%text%' ILIKE searches index scans. Queries are unchanged, so a server without pg_trgm (or a role that may not create it) just keeps the seq scans.
  if (await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm").then(() => true, () => false))
    for (const [t, c] of [["site_users", "name"], ["site_users", "email"]])
      await pool.query(`CREATE INDEX IF NOT EXISTS ${t}_${c}_trgm ON ${t} USING gin (${c} gin_trgm_ops)`).catch(() => {});
  // First start: stage the built-in board and calendar link in Postgres (plus a baseline revision to roll back to). Admin screens replace them.
  for (const [key, data, action] of [["board", boardSeed, "board.import"], ["calendar", { url: CAL_DEFAULT }, "calendar.import"],
    ...(await Promise.all(GUIDED_SEEDS.map(async (g) => [`guided:${g}`, JSON.parse(await readFile(path.join(process.cwd(), "data", "guided", g + ".json"), "utf8")), `guided.${g}.import`] as const)))] as const)
    if ((await pool.query("INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT DO NOTHING", [key, JSON.stringify(data)])).rowCount)
      await pool.query("INSERT INTO audit (actor, action, target, data) VALUES ('system', $1, 'initial', $2)", [action, JSON.stringify(data)]);
  // Locked pages are not editable in Puck, so their files are the source of truth on every start.
  for (const slug of LOCKED) await pool.query("INSERT INTO pages (slug, data, created_at) VALUES ($1, $2, '2000-01-01') ON CONFLICT (slug) DO UPDATE SET data = EXCLUDED.data", [slug, await readFile(path.join(process.cwd(), "data", "pages", slug + ".json"), "utf8")]);
  if ((await pool.query("SELECT 1 FROM pages WHERE slug <> ALL($1) LIMIT 1", [LOCKED])).rowCount) return;
  const dir = path.join(process.cwd(), "data", "pages");
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    await pool.query("INSERT INTO pages (slug, data, created_at) VALUES ($1, $2, '2000-01-01') ON CONFLICT DO NOTHING", [decodeURIComponent(f.slice(0, -5)), await readFile(path.join(dir, f), "utf8")]);
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
