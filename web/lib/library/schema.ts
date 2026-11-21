import type { Pool } from "pg";

// Document library tables (moodlecourseware/04, 08). Idempotent, run from db.ts after the training schema. P1 uses folders, docs, versions, placements and tags;
// the share, ack and bookmark tables are created now so P2 only adds code. Deleting is soft (deleted_at, 30-day recycle bin) because a document may be linked from courses and QR codes.
export async function librarySchema(pool: Pool) {
  const q = (s: string) => pool.query(s);
  await q("CREATE TABLE IF NOT EXISTS lib_folders (id serial PRIMARY KEY, parent_id int REFERENCES lib_folders ON DELETE CASCADE, position int NOT NULL DEFAULT 0, title text NOT NULL, slug text NOT NULL)");
  await q(`CREATE TABLE IF NOT EXISTS lib_docs (id serial PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL, description text NOT NULL DEFAULT '',
    type text NOT NULL DEFAULT 'other' CHECK (type IN ('manual','safety','sop','spec','form','other')), tier text NOT NULL DEFAULT 'staff' CHECK (tier IN ('public','members','authorized','staff')),
    listed boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')), current_version int NOT NULL DEFAULT 1, pinned boolean NOT NULL DEFAULT false,
    copyright_note text NOT NULL DEFAULT '', created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, tsv tsvector)`);
  await q(`CREATE TABLE IF NOT EXISTS lib_versions (doc_id int NOT NULL REFERENCES lib_docs ON DELETE CASCADE, version int NOT NULL, s3_key text NOT NULL, filename text NOT NULL DEFAULT '', size int NOT NULL DEFAULT 0, pages int NOT NULL DEFAULT 0,
    has_text boolean NOT NULL DEFAULT false, text_extract text NOT NULL DEFAULT '', thumb_key text, change_note text NOT NULL DEFAULT '', requires_reread boolean NOT NULL DEFAULT false, uploaded_by text NOT NULL DEFAULT '', at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (doc_id, version))`);
  await q("CREATE TABLE IF NOT EXISTS lib_placements (doc_id int NOT NULL REFERENCES lib_docs ON DELETE CASCADE, folder_id int NOT NULL REFERENCES lib_folders ON DELETE CASCADE, position int NOT NULL DEFAULT 0, PRIMARY KEY (doc_id, folder_id))");
  await q("CREATE INDEX IF NOT EXISTS lib_placements_folder ON lib_placements (folder_id, position)");
  await q("CREATE TABLE IF NOT EXISTS lib_tags (id serial PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE)");
  await q("CREATE TABLE IF NOT EXISTS lib_doc_tags (doc_id int NOT NULL REFERENCES lib_docs ON DELETE CASCADE, tag_id int NOT NULL REFERENCES lib_tags ON DELETE CASCADE, PRIMARY KEY (doc_id, tag_id))");
  await q("CREATE TABLE IF NOT EXISTS tool_docs (tool_id int NOT NULL REFERENCES tools ON DELETE CASCADE, doc_id int NOT NULL REFERENCES lib_docs ON DELETE CASCADE, role text NOT NULL DEFAULT 'manual' CHECK (role IN ('manual','sop','safety')), PRIMARY KEY (tool_id, doc_id))");
  await q(`CREATE TABLE IF NOT EXISTS lib_shares (id serial PRIMARY KEY, doc_id int NOT NULL REFERENCES lib_docs ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, allow_download boolean NOT NULL DEFAULT false,
    expires_at timestamptz, passcode_hash text, revoked_at timestamptz, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), opens int NOT NULL DEFAULT 0, last_open timestamptz)`);
  await q("CREATE TABLE IF NOT EXISTS lib_acks (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, doc_id int NOT NULL REFERENCES lib_docs ON DELETE CASCADE, version int NOT NULL, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, doc_id, version))");
  await q("CREATE TABLE IF NOT EXISTS lib_bookmarks (user_id int NOT NULL REFERENCES site_users ON DELETE CASCADE, doc_id int NOT NULL REFERENCES lib_docs ON DELETE CASCADE, PRIMARY KEY (user_id, doc_id))");
  await q("ALTER TABLE lib_docs ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS review_on date"); // A3: who looks after an SOP and when it is next checked
  await q("CREATE INDEX IF NOT EXISTS tool_docs_doc ON tool_docs (doc_id)");
  await q("CREATE INDEX IF NOT EXISTS lib_doc_tags_tag ON lib_doc_tags (tag_id)");
  await q("CREATE INDEX IF NOT EXISTS lib_shares_doc ON lib_shares (doc_id)");
  await q("CREATE INDEX IF NOT EXISTS lib_docs_tsv ON lib_docs USING gin (tsv)");
}
