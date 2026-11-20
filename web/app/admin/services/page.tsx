import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { envConfig, getConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { pingS3, s3Settings } from "@/lib/s3";
import { Database, Storage, type Status } from "./connection";

export const dynamic = "force-dynamic";

// Answers within 3 seconds or counts as down, so a dead server doesn't hang the page.
const alive = (p: Promise<unknown>) => new Promise<boolean>((done) => { const t = setTimeout(() => done(false), 3000); p.then(() => done(true), () => done(false)).finally(() => clearTimeout(t)); });

export default async function Setup() {
  if ((await gate("admin", "/admin/services")) !== "write") redirect("/admin");
  const env = envConfig(), cfg = getConfig();
  const s3 = cfg ? await s3Settings().catch(() => null) : null;
  const host = cfg && URL.canParse(cfg.databaseUrl) ? new URL(cfg.databaseUrl).host : undefined;
  const d = cfg ? db() : null;
  const [dbUp, s3Up] = await Promise.all([d ? alive(d.pool.query("SELECT 1")) : false, s3 ? alive(pingS3(s3)) : false]);
  const st = (set: boolean, up: boolean): Status => (!set ? { kind: "off", text: "Not configured" } : up ? { kind: "ok", text: "Connected" } : { kind: "bad", text: "Not responding" });
  return (
    <>
      <h1>Database &amp; storage</h1>
      <p className="sub">Where the site keeps its data and uploaded files. Status is checked each time this page opens. Upload limits, Google Maps, Spam protection and the Signing certificate are their own pages in this menu; Membership classes is under People.</p>
      <Database host={host} fromEnv={!!env} status={st(!!cfg, dbUp)} />
      <Storage s3={s3 ? { endpoint: s3.endpoint, bucket: s3.bucket, region: s3.region } : undefined} dbReady={!!cfg} status={st(!!s3, s3Up)} />
    </>
  );
}
