import { db } from "./db";
import { getMenu, type MenuItem } from "./store";
import { slugOfHref } from "./menu";

export type Node = { label: string; slug?: string; children: Node[] };
export type Entry = { slug: string; depth: number; lastmod: Date; created: Date };

import { SITE } from "./site";
export { SITE };
export const urlOf = (slug: string) => `${SITE}${slug === "index" ? "/" : "/" + slug}`;

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, mailto:, tel:, //host
const titleOf = (slug: string, d: any) => d?.root?.props?.title?.replace(/\s*\|.*$/, "") || slug.replace(/[-_\/]+/g, " ");

// Slug patterns for pages the menu doesn't mention (from the old hand-written sitemap). First match wins.
const GROUPS = [
  { re: /^how-to-/, parent: "how-to", label: "How-to guides" },
  { re: /meetup/, parent: "meetups", label: "Meetups" },
  { re: /^makerspace-vs-/, parent: "comparison", label: "Makerspace comparisons" },
  { re: /^s-/, label: "Local search landing pages" },
];

/** Site hierarchy = the menu (dropdowns are parents); published pages not in the menu go under "More pages". */
export async function siteTree() {
  const pages = new Map<string, { title: string; at: Date; created: Date; parent: string }>();
  const d = db();
  if (d) {
    await d.ready;
    const r = await d.pool.query("SELECT slug, data, updated_at, created_at AS created FROM pages");
    for (const p of r.rows) if (!p.data?.root?.props?.bare) pages.set(p.slug, { title: titleOf(p.slug, p.data), at: p.updated_at, created: p.created, parent: p.data?.root?.props?.parent ?? "" });
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
