import { NextResponse } from "next/server";
import { editingAllowed } from "@/lib/guard";
import { envConfig, saveConfig, type Cfg } from "@/lib/config";
import { ensureSchema, poolFor } from "@/lib/db";
import { probeS3 } from "@/lib/s3";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const msg = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));

// Tests each datasource; only when both pass is the config saved ("test and continue").
export async function POST(req: Request) {
  if (!(await editingAllowed("admin"))) return new NextResponse("not found", { status: 404 });
  if (envConfig()) return new NextResponse("configured via environment", { status: 409 });
  const b = await req.json().catch(() => ({}));
  const cfg: Cfg = {
    databaseUrl: str(b.databaseUrl), databaseCa: str(b.databaseCa) || undefined,
    s3: { endpoint: str(b.endpoint), bucket: str(b.bucket) || "uploads", region: str(b.region) || "us-east-1", accessKey: str(b.accessKey), secretKey: str(b.secretKey) },
  };
  const result = { db: "", s3: "", saved: false }; // "" = passed, otherwise the error text

  if (!cfg.databaseUrl) result.db = "Database URL required";
  else {
    const pool = poolFor(cfg);
    try { await ensureSchema(pool); } catch (e) { result.db = msg(e); } finally { await pool.end().catch(() => {}); }
  }
  if (!cfg.s3.endpoint || !cfg.s3.accessKey || !cfg.s3.secretKey) result.s3 = "Endpoint, access key and secret key required";
  else try { await probeS3(cfg.s3); } catch (e) { result.s3 = msg(e); }

  if (!result.db && !result.s3) { saveConfig(cfg); result.saved = true; }
  return NextResponse.json(result);
}
