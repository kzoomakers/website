import { db } from "./db";
import { getMenu, type MenuItem } from "./store";
import { slugOfHref } from "./menu";
import { priority } from "./priority";
import { listPosts } from "./blog";
import { listFinancials } from "./financials";

export type Node = { label: string; slug?: string; children: Node[] };
export type Entry = { slug: string; depth: number; lastmod: Date; created: Date };

import { SITE } from "./site";
export { SITE };
export const urlOf = (slug: string) => `${SITE}${slug === "index" ? "/" : "/" + slug}`;

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, mailto:, tel:, //host
const titleOf = (slug: string, props: any) => props?.title?.replace(/\s*\|.*$/, "") || slug.replace(/[-_\/]+/g, " ");

// Slug patterns for pages the menu doesn't mention (from the old hand-written sitemap). First match wins.
const GROUPS = [
  { re: /^how-to-/, parent: "how-to", label: "How-to guides" },
  { re: /meetup/, parent: "meetups", label: "Meetups" },
  { re: /^makerspace-vs-/, parent: "comparison", label: "Makerspace comparisons" },
  { re: /^s-/, label: "Local search landing pages" },
];

/** Site hierarchy = the menu (dropdowns are parents); published pages not in the menu go under "More pages". */
export async function siteTreeFresh() {
  const pages = new Map<string, { title: string; at: Date; created: Date; parent: string }>();
  const d = db();
  if (d) {
    await d.ready;
    const r = await d.pool.query("SELECT slug, data#>'{root,props}' AS props, updated_at, created_at AS created FROM pages");
    for (const p of r.rows) if (!p.props?.bare) pages.set(p.slug, { title: titleOf(p.slug, p.props), at: p.updated_at, created: p.created, parent: p.props?.parent ?? "" });
  }
  const seen = new Set<string>();
  const walk = (items: MenuItem[]): Node[] => items.flatMap((i): Node[] => {
    if (i.items) { const children = walk(i.items); return children.length ? [{ label: i.label, children }] : []; }
    if (!i.href || EXTERNAL.test(i.href)) return [];
    const slug = slugOfHref(i.href);
    if (!pages.has(slug) || seen.has(slug)) return [];
    seen.add(slug);
    return [{ label: i.label, slug, children: [] }];
  });
  const tree = walk(await getMenu());
  if (!seen.has("index") && pages.has("index")) { seen.add("index"); tree.unshift({ label: "Home", slug: "index", children: [] }); }
  const rest = [...pages].filter(([s]) => !seen.has(s)).sort(([, a], [, b]) => a.title.localeCompare(b.title))
    .map(([slug, p]): Node => ({ label: p.title, slug, children: [] }));
  const mine = (n: Node) => pages.get(n.slug!)!.parent;
  // Unlisted pages: nest under their parent page if there is one, else under a labelled group, else "More pages".
  const find = (ns: Node[], v: string): Node | undefined => { for (const n of ns) { const f = (n.slug ?? n.label) === v ? n : find(n.children, v); if (f) return f; } };
  const groups: Node[] = [], loose: Node[] = [];
  const group = (label: string) => groups.find((x) => x.label === label) ?? groups[groups.push({ label, children: [] }) - 1];
  for (const n of rest) {
    // Editor's choice ("Where in the sitemap") wins; its target must be a menu node or a page with no choice of its own (no cycles).
    const want = mine(n);
    const target = want && want !== n.slug && (find(tree, want) ?? find(rest.filter((r) => !mine(r)), want) ?? (GROUPS.some((g) => g.label === want) ? group(want) : undefined));
    if (target) { target.children.push(n); continue; }
    const g = GROUPS.find((x) => x.re.test(n.slug!) && x.parent !== n.slug);
    if (!g) { loose.push(n); continue; }
    (g.parent && (find(tree, g.parent) ?? find(rest, g.parent)) || group(g.label)).children.push(n);
  }
  tree.push(...groups, ...(loose.length ? [{ label: "More pages", children: loose }] : []));
  const entries: Entry[] = [];
  const flat = (ns: Node[], depth: number) => ns.forEach((n) => { if (n.slug) entries.push({ slug: n.slug, depth, lastmod: pages.get(n.slug)!.at, created: pages.get(n.slug)!.created }); flat(n.children, depth + 1); });
  flat(tree, 0);
  return { tree, entries };
}

/** A value rebuilt on demand by `refresh()` and otherwise served from memory. A failed rebuild keeps the last good value. */
function cached<T>(build: () => Promise<T>) {
  let value: T | undefined, inflight: Promise<T> | undefined;
  const refresh = () => (inflight ??= build().then((v) => (value = v)).finally(() => { inflight = undefined; }));
  return { get: async () => value ?? refresh(), refresh };
}

// The public sitemap page and sitemap.xml read this copy: built at startup and every 2.5 hours (instrumentation.ts), so edits show up there within 2.5 h. The page editor uses siteTreeFresh.
const tree = cached(siteTreeFresh);
export const siteTree = tree.get;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const xml = cached(async () => {
  const { entries } = await siteTreeFresh();
  const seen = new Set<string>();
  const urls = entries.filter((e) => !seen.has(e.slug) && seen.add(e.slug)).map((e) =>
    `  <url><loc>${esc(urlOf(e.slug))}</loc><lastmod>${e.lastmod.toISOString()}</lastmod><priority>${priority(e.slug, e.depth, e.lastmod, e.created)}</priority></url>`);
  const posts = await listPosts({ light: true }).catch(() => []);
  const blog = [`  <url><loc>${esc(urlOf("blog"))}</loc>${posts[0] ? `<lastmod>${new Date(posts[0].updated_at).toISOString()}</lastmod>` : ""}<priority>${priority("blog", 1, new Date(posts[0]?.updated_at ?? 0), new Date(0))}</priority></url>`,
    ...posts.map((p) => `  <url><loc>${esc(urlOf("blog/" + p.slug))}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod><priority>${priority("post", 1, new Date(p.updated_at), new Date(p.publish_at ?? p.updated_at))}</priority></url>`)];
  urls.push(...blog);
  const fin = await listFinancials().catch(() => []);
  if (fin.length) urls.push(`  <url><loc>${esc(urlOf("financials"))}</loc><lastmod>${new Date(Math.max(...fin.map((f) => +new Date(f.replaced_at ?? f.uploaded_at)))).toISOString()}</lastmod><priority>0.3</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
});
export const sitemapXml = xml.get;

/** Rebuilds both cached copies (startup and every 2.5 hours). */
export const warmSitemap = () => Promise.all([tree.refresh(), xml.refresh()]);
