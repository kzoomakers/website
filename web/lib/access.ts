import { ENTRIES } from "./nav-manifest";
// Admin access, pure (no database) so the admin screens can use it too.
// A person's rows in user_perms are keyed "section" (the whole section: every page in it) or "section:page" (just that page).
// Page rows only ever ADD access; setting a whole section replaces them. So a check that doesn't name a page can never be widened by a page row.
export const SECTIONS = ["website", "email", "blog", "messages", "people", "signdocs", "tours", "makerfavor", "system"] as const;
/** Section names before the rename: rows saved under them still count (and the startup migration rewrites them). */
export const LEGACY_SECTION: Record<string, Section> = { webmaster: "website", mail: "email", forms: "messages", crm: "people", board: "signdocs", chores: "makerfavor", admin: "system" };
/** A saved permission key ("crm" or "crm:classes") under today's section name. */
export const modernKey = (k: string) => { const [s, ...rest] = k.split(":"); return [LEGACY_SECTION[s] ?? s, ...rest].join(":"); };
export type Section = (typeof SECTIONS)[number];
export type Level = "read" | "write";
export type Perms = Partial<Record<string, Level>>;

export const SECTION_LABEL: Record<Section, string> = { website: "Website", email: "Email", blog: "Blog", messages: "Messages", people: "People", signdocs: "SignDocs", tours: "Tours", makerfavor: "MakerFavor", system: "System" };

/** Every admin page that access can be given to on its own. `path` is the URL (and everything under it, unless a longer path below is listed). The first page of a section is its front page.
 *  `full` pages are never granted one by one: they change who has access, so only a full administrator may open them. */
export type Page = { section: Section; key: string; label: string; path: string; full?: boolean; also?: string[] }; // also: other URLs that belong to this page (the email editor lives under /admin/email/email)
// Permission pages come from the nav manifest. A section's own pages come first (its first one is its front page), then pages shown in another tab, then the full-admin-only ones.
const order = (p: Page, tab: Section) => (p.full ? 2 : p.section === tab ? 0 : 1);
export const PAGES: Page[] = ENTRIES.filter(([, e]) => e.key)
  .map(([t, e]) => ({ p: { section: e.section ?? t.section, key: e.key!, label: e.pageLabel ?? e.label, path: e.href, full: e.full, also: e.also } as Page, tab: t.section }))
  .sort((a, b) => order(a.p, a.tab) - order(b.p, b.tab)).map((x) => x.p);
export const pagesOf = (s: Section) => PAGES.filter((p) => p.section === s);

/** The page a URL belongs to: the longest listed path that is the URL or a parent of it. */
export const pageOf = (url: string): Page | undefined => {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const hit = (p: Page) => [p.path, ...(p.also ?? [])].filter((x) => path === x || path.startsWith(x + "/")).sort((a, b) => b.length - a.length)[0];
  return PAGES.map((p) => [p, hit(p)] as const).filter(([, h]) => h).sort((a, b) => b[1]!.length - a[1]!.length)[0]?.[0];
};

const rank = (l?: Level) => (l === "write" ? 2 : l === "read" ? 1 : 0);
const best = (...ls: (Level | undefined)[]) => ls.reduce<Level | undefined>((a, l) => (rank(l) > rank(a) ? l : a), undefined);
/** Level for a section, or for one page of it (or the best of several pages, or "*" for any page). Full administrators have write everywhere. Without a page, only a whole-section grant counts. */
export function levelFor(perms: Perms, section: Section, page?: string | string[]): Level | undefined {
  if (perms.system === "write") return "write";
  const keys = page === "*" ? pagesOf(section).map((p) => p.key) : page === undefined ? [] : [page].flat(); // "*" = an endpoint every page of the section shares
  return best(perms[section], ...keys.map((k) => perms[`${section}:${k}`]));
}
/** Any access at all inside a section: the whole thing or any one page. Decides who sees the tab, not what they may do. */
export const anyLevel = (perms: Perms, section: Section): Level | undefined =>
  perms.system === "write" ? "write" : best(perms[section], ...pagesOf(section).map((p) => perms[`${section}:${p.key}`]));
/** The URL to send someone to for a section: its front page if they may open it, else the first page they can. */
export const entryPath = (perms: Perms, section: Section): string | undefined => pagesOf(section).find((p) => levelFor(perms, section, p.key))?.path;
