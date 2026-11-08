import { NextResponse } from "next/server";
import { editingAllowed } from "@/lib/guard";
import { envConfig, getConfig, saveConfig, type Cfg, type S3Cfg } from "@/lib/config";
import { ensureSchema, poolFor } from "@/lib/db";
import { forgetS3Settings, probeS3 } from "@/lib/s3";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const msg = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));

// Tests Postgres and storage; only when both pass is anything saved. Postgres is the only bootstrap config (env, or config.json written here);
// storage is saved in the database (settings row "s3"). A blank URL or key keeps what is already stored.
export async function POST(req: Request) {
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => ({}));
  const env = envConfig();
  const url = str(b.databaseUrl);
  const dbCfg: Pick<Cfg, "databaseUrl" | "databaseCa"> | null = env ?? (url ? { databaseUrl: url, databaseCa: str(b.databaseCa) || undefined } : getConfig());
  const result = { db: "", s3: "", saved: false }; // "" = passed, otherwise the error text
  if (!dbCfg?.databaseUrl) return NextResponse.json({ ...result, db: "Database URL required" });

  // This server's disk is wiped on every Fly deploy, so a config.json written here would vanish and the site would forget its database.
  if (!env && process.env.FLY_APP_NAME) return NextResponse.json({ ...result, db: "Set DATABASE_URL (and DATABASE_CA) as Fly secrets: `fly secrets set DATABASE_URL=...`. A database saved from this page would be lost on the next deploy." });

  const pool = poolFor(dbCfg);
  try {
    try { await ensureSchema(pool); } catch (e) { result.db = msg(e); return NextResponse.json(result); }
    const old = ((await pool.query("SELECT data FROM settings WHERE key='s3'")).rows[0]?.data as S3Cfg | undefined) ?? getConfig()?.s3; // else the legacy env / config.json storage
    const s3: S3Cfg = {
      endpoint: str(b.endpoint), bucket: str(b.bucket) || "uploads", region: str(b.region) || "us-east-1",
      accessKey: str(b.accessKey) || old?.accessKey || "", secretKey: str(b.secretKey) || old?.secretKey || "",
    };
    if (!s3.endpoint || !s3.accessKey || !s3.secretKey) result.s3 = "Endpoint, access key and secret key required";
    else try { await probeS3(s3); } catch (e) { result.s3 = msg(e); }
    if (!result.s3) {
      await pool.query("INSERT INTO settings (key, data) VALUES ('s3', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(s3)]);
      if (!env) saveConfig(dbCfg);
      forgetS3Settings();
      result.saved = true;
    }
  } finally { await pool.end().catch(() => {}); }
  return NextResponse.json(result);
}
