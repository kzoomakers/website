import fs from "fs";
import path from "path";

export type Cfg = {
  databaseUrl: string;
  databaseCa?: string;
  s3: { endpoint: string; bucket: string; region: string; accessKey: string; secretKey: string };
};

const FILE = path.resolve(process.env.CONFIG_PATH ?? "data/config.json");
const e = process.env;

// Env wins (Fly secrets); otherwise the file the first-run setup wizard writes.
// shortcut: secrets sit in plaintext on the app volume, move to a secret store if the volume is ever shared.
export function envConfig(): Cfg | null {
  if (!e.DATABASE_URL || !e.S3_ENDPOINT) return null;
  return {
    databaseUrl: e.DATABASE_URL, databaseCa: e.DATABASE_CA,
    s3: { endpoint: e.S3_ENDPOINT, bucket: e.S3_BUCKET ?? "uploads", region: e.S3_REGION ?? "us-east-1", accessKey: e.S3_ACCESS_KEY ?? "", secretKey: e.S3_SECRET_KEY ?? "" },
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
