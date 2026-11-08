// Sitemap priority: where the page sits in the menu sets the base (home 1.0, top level 0.8, nested 0.6, unlisted 0.4);
// pages edited recently get a boost, and brand-new pages a little more. Home stays 1.0; nothing else exceeds 0.9.
const DAY = 86400_000;

export function priority(slug: string, depth: number, lastmod: Date, created: Date, now = Date.now()) {
  if (slug === "index") return "1.0";
  const base = depth === 0 ? 0.8 : depth === 1 ? 0.6 : 0.4;
  const edited = (now - lastmod.getTime()) / DAY, age = (now - created.getTime()) / DAY;
  const fresh = edited < 7 ? 0.2 : edited < 30 ? 0.1 : edited < 90 ? 0.05 : 0;
  const isNew = age < 30 ? 0.1 : 0;
  return Math.min(0.9, base + fresh + isNew).toFixed(2).replace(/0$/, "");
}
