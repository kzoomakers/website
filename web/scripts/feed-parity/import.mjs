// Dev-only (see README.md): loads the JSON written by export.rb into the feed schema of the Postgres DATABASE_URL points at. Replaces whatever is in feed.* first.
// usage: DATABASE_URL=postgres://… node import.mjs <dir with the .json files>
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const dir = process.argv[2];
if (!dir || !process.env.DATABASE_URL) { console.error("usage: DATABASE_URL=… node import.mjs <dir>"); process.exit(1); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ORDER = ["categories", "tags", "users", "usernames", "domains", "origins", "stories", "story_texts", "taggings", "hats", "comments", "comment_stats", "hat_requests", "hidden_stories", "saved_stories",
  "invitations", "invitation_requests", "links", "messages", "moderations", "mod_notes", "notifications", "keystores", "votes", "read_ribbons", "suggested_taggings", "suggested_titles", "tag_filters",
  "mod_activities", "mod_mails", "mod_mail_messages", "mod_mail_recipients", "mod_mail_references", "hotspot_docs", "hotspot_terms", "hotspot_term_counts"];
const DROP = { users: ["session_token"] };

const c = await pool.connect();
await c.query("BEGIN");
await c.query("SET LOCAL TIME ZONE 'UTC'");
await c.query("SET LOCAL session_replication_role = replica"); // dev database only: rows reference each other in any order (invited_by, merged stories)
await c.query(`TRUNCATE ${ORDER.map((t) => "feed." + t).join(", ")} RESTART IDENTITY CASCADE`);
for (const t of ORDER) {
  const f = path.join(dir, t + ".json");
  if (!fs.existsSync(f)) continue;
  const rows = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!rows.length) continue;
  const types = Object.fromEntries((await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'feed' AND table_name = $1", [t])).rows.map((r) => [r.column_name, r.data_type]));
  const cols = Object.keys(rows[0]).filter((k) => types[k] && !(DROP[t] ?? []).includes(k));
  const conv = (col, v) => {
    if (v === null) return null;
    const ty = types[col];
    if (ty === "boolean") return v === 1 || v === true || v === "1" || v === "t";
    if (ty === "bytea") return Buffer.from(v, "hex");
    if (ty === "jsonb") { try { return JSON.stringify(JSON.parse(v)); } catch { return col === "settings" ? "{}" : JSON.stringify(v); } }
    return v;
  };
  for (const r of rows) await c.query(`INSERT INTO feed.${t} (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")})`, cols.map((k) => conv(k, r[k])));
  await c.query(`SELECT setval(pg_get_serial_sequence('feed.${t}', 'id'), (SELECT max(id) FROM feed.${t}))`);
  console.log(t, rows.length);
}
await c.query("INSERT INTO settings (key, data) VALUES ('feed:config', '{\"enabled\": true}') ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data"); // switch the feed on for the comparison
await c.query("COMMIT");
c.release(); await pool.end();
