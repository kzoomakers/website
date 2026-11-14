import { forget } from "./memo";
import { conn, db } from "./db";
import { logAudit } from "./store";

export const MAX_PDF = 10 * 1024 * 1024;
export const DEFAULT_ORG = "Kalamazoo Innovation Initiative, Inc.";
export const validYear = (y: number) => Number.isInteger(y) && y >= 1990 && y <= 2100;
export const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-";
export type Fin = { year: number; filename: string; size: number; uploaded_at: string; replaced_at: string | null };


export async function getOrg(): Promise<string> {
  if (!db()) return DEFAULT_ORG;
  return (await (await conn()).query("SELECT data FROM settings WHERE key = 'financials'")).rows[0]?.data?.org ?? DEFAULT_ORG;
}

export async function saveOrg(org: string, who: string) {
  await (await conn()).query("INSERT INTO settings (key, data) VALUES ('financials', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify({ org })]);
  await logAudit(who, "financials.org", org);
}

export async function listFinancials(): Promise<Fin[]> {
  if (!db()) return [];
  return (await (await conn()).query("SELECT year, filename, length(data) AS size, uploaded_at, replaced_at FROM financials ORDER BY year DESC")).rows;
}

export async function getFinancial(year: number): Promise<{ filename: string; data: Buffer } | undefined> {
  if (!db()) return undefined;
  return (await (await conn()).query("SELECT filename, data FROM financials WHERE year = $1", [year])).rows[0];
}

/** Upload, or replace the year's PDF (the first upload date is kept; replaced_at records the re-upload). */
export async function putFinancial(year: number, filename: string, data: Buffer, who: string) {
  const r = await (await conn()).query(
    `INSERT INTO financials (year, filename, data) VALUES ($1,$2,$3)
     ON CONFLICT (year) DO UPDATE SET filename = EXCLUDED.filename, data = EXCLUDED.data, replaced_at = now() RETURNING replaced_at`, [year, filename.slice(0, 200), data]);
  forget("financials?");
  await logAudit(who, r.rows[0].replaced_at ? "financials.replace" : "financials.upload", `${year}: ${filename}`);
}

export async function deleteFinancial(year: number, who: string) {
  forget("financials?");
  if ((await (await conn()).query("DELETE FROM financials WHERE year = $1", [year])).rowCount) await logAudit(who, "financials.delete", String(year));
}
