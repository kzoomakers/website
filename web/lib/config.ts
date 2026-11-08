import fs from "fs";
import path from "path";

export type S3Cfg = { endpoint: string; bucket: string; region: string; accessKey: string; secretKey: string };
// Only the database is bootstrap config. Storage lives in the settings table (key "s3", edited on /admin/services);
// `s3` here is the legacy S3_* env / config.json fallback.
export type Cfg = { databaseUrl: string; databaseCa?: string; s3?: S3Cfg };

const FILE = path.resolve(process.env.CONFIG_PATH ?? "data/config.json");
const e = process.env;

// Env wins (Fly secrets); otherwise the file the first-run setup wizard writes.
// Only the database URL may touch disk (config.json), and only for local dev: on Fly it comes from DATABASE_URL because the disk is wiped on deploy.
// shortcut: S3 keys sit in plaintext in the settings table (as do the mail keys); seal them with vault.ts if the database is ever shared.
export function envConfig(): Cfg | null {
  if (!e.DATABASE_URL) return null;
  return {
    databaseUrl: e.DATABASE_URL, databaseCa: e.DATABASE_CA,
    s3: !e.S3_ENDPOINT ? undefined : { endpoint: e.S3_ENDPOINT, bucket: e.S3_BUCKET ?? "uploads", region: e.S3_REGION ?? "us-east-1", accessKey: e.S3_ACCESS_KEY ?? "", secretKey: e.S3_SECRET_KEY ?? "" },
  };
}

export function getConfig(): Cfg | null {
  const env = envConfig();
  if (env) return env;
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return null; }
}

export function saveConfig(c: Cfg) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
}

/** pg parses ?sslmode= after (and over) the `ssl` option, which silently drops our CA and fails with SELF_SIGNED_CERT_IN_CHAIN on Aiven. With a CA, drop sslmode and verify against the CA instead. */
export const pgConnection = (c: Pick<Cfg, "databaseUrl" | "databaseCa">) =>
  c.databaseCa
    ? { connectionString: c.databaseUrl.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""), ssl: { ca: c.databaseCa } }
    : { connectionString: c.databaseUrl };
