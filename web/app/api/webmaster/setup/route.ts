import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { envConfig, getConfig, saveConfig, type Cfg, type S3Cfg } from "@/lib/config";
import { ensureSchema, poolFor } from "@/lib/db";
import { forgetS3Settings, probeS3 } from "@/lib/s3";
import { logAudit } from "@/lib/store";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const msg = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));
const audit = async (action: string, detail: string) => { try { await logAudit(await actor(), action, detail); } catch { /* a brand-new database may not be readable by the app yet */ } };

// POST { part: "db" | "s3", test?: true, ...fields }. Each part is tested on its own; it is saved only when the test passes and `test` is not set.
// Postgres is the only bootstrap config (env, or config.json written here); storage is saved in the database (settings row "s3").
// A blank URL or key keeps what is already stored. Answers { error: "" when it passed, saved, first: the database was not configured before }.
export async function POST(req: Request) {
  if (!(await editingAllowed("admin", "write", "setup"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => ({})), test = b.test === true, env = envConfig(), had = getConfig();
  const out = (error: string, saved = false) => NextResponse.json({ error, saved, first: !had });

  if (b.part === "db") {
    if (env) return out("The database is set by the DATABASE_URL environment variable; change it there.");
    const url = str(b.databaseUrl), dbCfg: Pick<Cfg, "databaseUrl" | "databaseCa"> | null = url ? { databaseUrl: url, databaseCa: str(b.databaseCa) || undefined } : had;
    if (!dbCfg?.databaseUrl) return out("Database URL required");
    // This server's disk is wiped on every Fly deploy, so a config.json written here would vanish and the site would forget its database.
    if (!test && process.env.FLY_APP_NAME) return out("Set DATABASE_URL (and DATABASE_CA) as Fly secrets: `fly secrets set DATABASE_URL=...`. A database saved from this page would be lost on the next deploy.");
    const pool = poolFor(dbCfg);
    try {
      try { await (test ? pool.query("SELECT 1") : ensureSchema(pool)); } catch (e) { return out(msg(e)); }
      if (test) return out("");
      saveConfig(dbCfg);
    } finally { await pool.end().catch(() => {}); }
    await audit("setup.database", new URL(dbCfg.databaseUrl).host);
    return out("", true);
  }

  if (b.part === "s3") {
    const dbCfg = env ?? had;
    if (!dbCfg?.databaseUrl) return out("Connect the database first; storage settings are kept in it.");
    const pool = poolFor(dbCfg);
    try {
      const old = ((await pool.query("SELECT data FROM settings WHERE key='s3'").catch(() => null))?.rows[0]?.data as S3Cfg | undefined) ?? had?.s3; // else the legacy env / config.json storage
      const s3: S3Cfg = {
        endpoint: str(b.endpoint), bucket: str(b.bucket) || "uploads", region: str(b.region) || "us-east-1",
        accessKey: str(b.accessKey) || old?.accessKey || "", secretKey: str(b.secretKey) || old?.secretKey || "",
      };
      if (!s3.endpoint || !s3.accessKey || !s3.secretKey) return out("Endpoint, access key and secret key required");
      try { await probeS3(s3); } catch (e) { return out(msg(e)); }
      if (test) return out("");
      await pool.query("INSERT INTO settings (key, data) VALUES ('s3', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(s3)]);
      forgetS3Settings();
      await audit("setup.storage", `${s3.endpoint} / ${s3.bucket}`);
      return out("", true);
    } finally { await pool.end().catch(() => {}); }
  }
  return new NextResponse("part must be db or s3", { status: 400 });
}
