// The decisions behind the Database & storage page, kept free of network and disk so they can be tested.
import type { Cfg, S3Cfg } from "./config";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** What to connect to for a database test or save: `{ error }` to refuse, else the config. A blank URL keeps the saved one. */
export function planDb(a: { env: Cfg | null; had: Cfg | null; url: unknown; ca: unknown; test: boolean; fly: boolean }): { error: string } | { cfg: Pick<Cfg, "databaseUrl" | "databaseCa"> } {
  if (a.env) return { error: "The database is set by the DATABASE_URL environment variable; change it there." };
  const url = str(a.url), cfg = url ? { databaseUrl: url, databaseCa: str(a.ca) || undefined } : a.had;
  if (!cfg?.databaseUrl) return { error: "Database URL required" };
  // This server's disk is wiped on every Fly deploy, so a config.json written here would vanish and the site would forget its database.
  if (!a.test && a.fly) return { error: "Set DATABASE_URL (and DATABASE_CA) as Fly secrets: `fly secrets set DATABASE_URL=...`. A database saved from this page would be lost on the next deploy." };
  return { cfg };
}

/** Storage settings from the form; a blank access or secret key keeps the saved one. */
export const mergeS3 = (b: Record<string, unknown>, old?: S3Cfg): S3Cfg => ({
  endpoint: str(b.endpoint), bucket: str(b.bucket) || "uploads", region: str(b.region) || "us-east-1",
  accessKey: str(b.accessKey) || old?.accessKey || "", secretKey: str(b.secretKey) || old?.secretKey || "",
});
