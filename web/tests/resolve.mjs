// Lets the tests load app modules the way Next does: "./db" and "@/lib/x" without an extension, and JSON without an import attribute.
// Used by `npm test` (node --import ./tests/resolve.mjs --test).
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", ${JSON.stringify(import.meta.url)});
const isFile = (u) => { try { return statSync(fileURLToPath(u)).isFile(); } catch { return false; } };
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) spec = new URL(spec.slice(2), root).href;
  if (/^(\\.\\.?\\/|file:)/.test(spec) && ctx.parentURL) {
    const abs = new URL(spec, ctx.parentURL).href;
    const hit = ["", ".ts", ".tsx", "/index.ts"].map((e) => abs + e).find(isFile);
    if (hit) return next(hit, ctx);
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.endsWith(".json") && !url.includes("node_modules")) return next(url, { ...ctx, importAttributes: { type: "json" } });
  return next(url, ctx);
}
`), import.meta.url);
