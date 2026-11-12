// Admin access, pure (no database) so the admin screens can use it too.
// A person's rows in user_perms are keyed "section" (the whole section: every page in it) or "section:page" (just that page).
// Page rows only ever ADD access; setting a whole section replaces them. So a check that doesn't name a page can never be widened by a page row.
export const SECTIONS = ["webmaster", "mail", "blog", "forms", "crm", "board", "tours", "chores", "admin"] as const;
export type Section = (typeof SECTIONS)[number];
export type Level = "read" | "write";
export type Perms = Partial<Record<string, Level>>;

export const SECTION_LABEL: Record<Section, string> = { webmaster: "Website", mail: "Email", blog: "Blog", forms: "Messages", crm: "People", board: "eSign", tours: "Tours", chores: "Chores", admin: "System" };

/** Every admin page that access can be given to on its own. `path` is the URL (and everything under it, unless a longer path below is listed). The first page of a section is its front page.
 *  `full` pages are never granted one by one: they change who has access, so only a full administrator may open them. */
export type Page = { section: Section; key: string; label: string; path: string; full?: boolean; also?: string[] }; // also: other URLs that belong to this page (the email editor lives under /admin/mailer/email)
const P = (section: Section, rows: [string, string, string][]): Page[] => rows.map(([key, label, path]) => ({ section, key, label, path }));
export const PAGES: Page[] = [
  ...P("webmaster", [["pages", "Pages", "/admin/webmaster"], ["guided", "Guided pages", "/admin/webmaster/guided"], ["calendar", "Calendar", "/admin/webmaster/calendar"], ["board", "Board", "/admin/webmaster/board"], ["financials", "Financials", "/admin/webmaster/financials"],
    ["hours", "Hours & address", "/admin/webmaster/hours"], ["menu", "Menu", "/admin/webmaster/menu"], ["robots", "Search engine settings", "/admin/webmaster/robots"], ["reviews", "Reviews", "/admin/webmaster/reviews"],
    ["analytics", "Analytics", "/admin/webmaster/analytics"], ["handbook-updates", "Handbook updates", "/admin/webmaster/handbook-updates"]]),
  ...P("mail", [["overview", "Overview", "/admin/mailer"], ["emails", "Emails", "/admin/mailer/emails"], ["forms", "Signup forms", "/admin/mailer/forms"], ["subscribers", "Subscribers", "/admin/mailer/subscribers"], ["lists", "Lists", "/admin/mailer/lists"],
    ["queue", "Queue", "/admin/mailer/queue"], ["settings", "Settings", "/admin/mailer/settings"]]),
  ...P("blog", [["posts", "Posts", "/admin/blog"], ["categories", "Categories", "/admin/blog/categories"], ["authors", "Authors", "/admin/blog/authors"], ["media", "Media", "/admin/blog/media"], ["comments", "Comments", "/admin/blog/comments"]]),
  ...P("forms", [["messages", "Messages", "/admin/forms"]]),
  ...P("crm", [["people", "People", "/admin/crm"], ["approvals", "New members", "/admin/crm/approvals"], ["classes", "Classes", "/admin/crm/classes"], ["tools", "Tools & sign-offs", "/admin/crm/tools"], ["skills", "Skills", "/admin/crm/skills"],
    ["values", "Profile options", "/admin/crm/values"], ["waiver", "Membership agreement", "/admin/crm/waiver"], ["guest-agreement", "Guest agreement", "/admin/crm/guest-agreement"], ["guests", "Guests", "/admin/crm/guests"]]),
  ...P("board", [["documents", "Documents", "/admin/esign"], ["new", "New document", "/admin/esign/new"], ["templates", "Templates", "/admin/esign/templates"], ["buckets", "Folders", "/admin/esign/buckets"]]),
  ...P("tours", [["bookings", "Bookings", "/admin/tours"], ["walkups", "Walk-ups", "/admin/tours/walkups"], ["availability", "Availability", "/admin/tours/availability"], ["stats", "Statistics", "/admin/tours/stats"], ["timeline", "Timeline", "/admin/tours/timeline"],
    ["notifications", "Tour alerts", "/admin/tours/notifications"]]),
  ...P("chores", [["todo", "To do", "/admin/makerfavor"], ["log", "Hours", "/admin/makerfavor/log"], ["stats", "Stats", "/admin/makerfavor/stats"], ["achievements", "Achievements", "/admin/makerfavor/achievements"]]),
  ...P("admin", [["setup", "Setup", "/admin/services"], ["audit", "Audit log", "/admin/services/audit"], ["ntfy", "Alert delivery", "/admin/services/ntfy"], ["api-keys", "API keys", "/admin/services/api-keys"], ["ai", "AI", "/admin/services/ai"],
    ["google-analytics", "Analytics & cookies", "/admin/services/google-analytics"], ["privacy", "Privacy statement", "/admin/services/privacy"], ["links", "External links", "/admin/services/links"], ["debug", "Debug", "/admin/services/debug"],
    ["httplog", "HTTP log", "/admin/services/httplog"], ["pgstats", "Database stats", "/admin/services/pgstats"], ["security", "Security headers", "/admin/services/security"]]),
  { section: "admin", key: "users", label: "Access", path: "/admin/users", full: true },
  { section: "admin", key: "special", label: "Special permissions", path: "/admin/users/special", full: true },
];
PAGES.find((p) => p.section === "mail" && p.key === "emails")!.also = ["/admin/mailer/email"];
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
  if (perms.admin === "write") return "write";
  const keys = page === "*" ? pagesOf(section).map((p) => p.key) : page === undefined ? [] : [page].flat(); // "*" = an endpoint every page of the section shares
  return best(perms[section], ...keys.map((k) => perms[`${section}:${k}`]));
}
/** Any access at all inside a section: the whole thing or any one page. Decides who sees the tab, not what they may do. */
export const anyLevel = (perms: Perms, section: Section): Level | undefined =>
  perms.admin === "write" ? "write" : best(perms[section], ...pagesOf(section).map((p) => perms[`${section}:${p.key}`]));
/** The URL to send someone to for a section: its front page if they may open it, else the first page they can. */
export const entryPath = (perms: Perms, section: Section): string | undefined => pagesOf(section).find((p) => levelFor(perms, section, p.key))?.path;
