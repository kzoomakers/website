import { promises as fs } from "fs";
import path from "path";
import type { Data } from "@puckeditor/core";

// POC storage: one JSON file per page. Phase 2 swaps this for Postgres; keep the same 4 functions.
const DIR = path.join(process.cwd(), "data", "pages");

// Slugs come from URLs, so whitelist chars: blocks path traversal like "../".
const clean = (slug: string) => {
  if (!/^[a-z0-9][a-z0-9_\-\/]*$/i.test(slug)) throw new Error("bad slug");
  return encodeURIComponent(slug) + ".json";
};

export const slugOf = (segs?: string[]) => (segs?.length ? segs.join("/") : "index");

export async function getPage(slug: string): Promise<Data | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, clean(slug)), "utf8"));
  } catch (e: any) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export async function savePage(slug: string, data: Data) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, clean(slug)), JSON.stringify(data, null, 2));
}

export async function deletePage(slug: string) {
  await fs.rm(path.join(DIR, clean(slug)), { force: true });
}

export async function listPages(): Promise<string[]> {
  const files = await fs.readdir(DIR).catch(() => []);
  return files.filter((f) => f.endsWith(".json")).map((f) => decodeURIComponent(f.slice(0, -5)));
}
