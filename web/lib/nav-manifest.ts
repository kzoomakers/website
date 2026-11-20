// The one list behind the admin top tabs, side menus, page titles, permission pages and alert badges (and the members menu).
// To add a page, add a line here. `key` makes an entry a permission page (section:key); entries without one belong to the page above them in the URL.
import type { Section } from "./access";

export type AlertKey = "reviews" | "comments" | "forms" | "applicants" | "walkups";
export type Entry = {
  href: string; icon: string; label: string; exact?: boolean;
  key?: string; pageLabel?: string; // permission page key, and its name when it differs from the menu label
  section?: Section; // owning permission section when not the tab's (public-content pages kept under /admin/services)
  full?: boolean; also?: string[]; // see Page in access.ts
  alert?: AlertKey; // count of waiting items shown on this link and rolled up onto its tab
  hidden?: boolean; // a permission page with no menu link
};
export type Item = Entry | { icon: string; label: string; items: Item[] };
export type Tab = { href: string; label: string; color: string; section: Section; items: Item[] };

const E = (href: string, icon: string, label: string, key?: string, more: Partial<Entry> = {}): Entry => ({ href, icon, label, key, ...more });
const G = (href: string, icon: string, label: string): Entry => E(`/admin/webmaster/guided/${href}`, icon, label);

// Guided pages are listed on the Pages screen, not in the menu; kept here so their browser titles stay.
export const GUIDED = [G("index", "🏠", "Homepage"), G("about", "ℹ️", "About Us"), G("pricing", "💲", "Pricing"), G("team", "🙌", "The Team"), G("what_is_a_makerspace", "💭", "Maker Philosophy"), G("history", "📜", "History"), G("how-to", "📚", "How To / Guides"), G("why-kzoo-makers", "🌟", "Why join us?"), G("handbook", "📘", "Handbook"), G("contact", "✉️", "Contact Us"), G("tools-we-are-seeking-donations-kalamazoo", "🧰", "Donate Tools"), G("other-makerspaces", "🗺️", "Other makerspaces"), G("laser-shop", "🔥", "Laser shop"), G("wood-shop", "🪵", "Wood shop"), G("metal-shop", "🔩", "Metal shop"), G("3d-printing", "🖨️", "3D printing"), G("craft-room-kalamazoo", "🧵", "Craft room"), G("meeting-space", "🤝", "Meeting space")].map((e) => ({ ...e, hidden: true }));

export const NAV: Tab[] = [
  { href: "/admin/webmaster", label: "Website", color: "#c00", section: "webmaster", items: [
    E("/admin/webmaster", "📄", "Pages", "pages", { exact: true }),
    E("/admin/webmaster/guided", "", "Guided pages", "guided", { hidden: true }),
    ...GUIDED,
    E("/admin/webmaster/calendar", "📅", "Calendar", "calendar"), E("/admin/webmaster/board", "👥", "Board", "board"), E("/admin/webmaster/financials", "💰", "Financials", "financials"),
    E("/admin/webmaster/hours", "🕙", "Hours & address", "hours"), E("/admin/webmaster/menu", "☰", "Menu", "menu"),
    E("/admin/services/privacy", "🔒", "Privacy statement", "privacy", { section: "admin" }), E("/admin/services/links", "🔗", "External links", "links", { section: "admin" }),
    E("/admin/webmaster/robots", "🤖", "Search engine settings", "robots"),
    E("/admin/services/google-analytics", "📊", "Analytics & cookies", "google-analytics", { section: "admin" }),
    E("/admin/webmaster/reviews", "⭐", "Reviews", "reviews", { alert: "reviews" }),
    E("/admin/webmaster/analytics", "📈", "Site analytics", "analytics"),
    E("/admin/webmaster/handbook-updates", "📣", "Handbook updates", "handbook-updates"),
  ] },
  { href: "/admin/mailer", label: "Email", color: "#1b7f3b", section: "mail", items: [
    E("/admin/mailer", "📊", "Overview", "overview", { exact: true }), E("/admin/mailer/emails", "✉️", "Emails", "emails", { also: ["/admin/mailer/email"] }), E("/admin/mailer/forms", "📝", "Signup forms", "forms"),
    E("/admin/mailer/subscribers", "👥", "Subscribers", "subscribers"), E("/admin/mailer/lists", "📋", "Lists", "lists"), E("/admin/mailer/queue", "⏳", "Queue", "queue"), E("/admin/mailer/settings", "⚙️", "Settings", "settings"),
    E("/admin/mailer/tracking", "", "Tracking", "tracking", { hidden: true }),
  ] },
  { href: "/admin/blog", label: "Blog", color: "#2563eb", section: "blog", items: [
    E("/admin/blog", "📝", "Posts", "posts", { exact: true }), E("/admin/blog/categories", "🏷️", "Categories", "categories"), E("/admin/blog/authors", "✍️", "Authors", "authors"),
    E("/admin/blog/media", "🖼️", "Media", "media"), E("/admin/blog/comments", "💬", "Comments", "comments", { alert: "comments" }),
  ] },
  { href: "/admin/forms", label: "Messages", color: "#7c3aed", section: "forms", items: [
    E("/admin/forms", "📬", "All messages", "messages", { exact: true, pageLabel: "Messages", alert: "forms" }), E("/admin/forms/contact", "✉️", "Contact"), E("/admin/forms/board", "🏛️", "Board"), E("/admin/forms/donation", "🎁", "Donations"),
  ] },
  { href: "/admin/crm", label: "People", color: "#0891b2", section: "crm", items: [
    E("/admin/crm", "👥", "People", "people", { exact: true }), E("/admin/crm/guests", "🧑‍🤝‍🧑", "Guests", "guests"), E("/admin/crm/approvals", "✅", "New members", "approvals", { alert: "applicants" }), E("/admin/crm/classes", "🎓", "Classes", "classes"),
    E("/admin/crm/tools", "🔧", "Tools & sign-offs", "tools"), E("/admin/crm/skills", "🛠️", "Skills", "skills"), E("/admin/crm/values", "🏷️", "Profile options", "values"),
    E("/admin/crm/membership-classes", "💳", "Membership classes", "membership-classes"),
    E("/admin/crm/waiver", "📜", "Membership agreement", "waiver"), E("/admin/crm/guest-agreement", "🪪", "Guest agreement", "guest-agreement"), E("/admin/crm/id-renewals", "🪪", "ID renewals", "id-renewals"),
  ] },
  { href: "/admin/esign", label: "SignDocs", color: "#0f766e", section: "board", items: [
    E("/admin/esign", "📄", "Documents", "documents", { exact: true }), E("/admin/esign/new", "➕", "New document", "new"), E("/admin/esign/templates", "📑", "Templates", "templates"), E("/admin/esign/buckets", "🗂️", "Folders", "buckets"),
  ] },
  { href: "/admin/tours", label: "Tours", color: "#e11d48", section: "tours", items: [
    E("/admin/tours", "🗓️", "Bookings", "bookings", { exact: true }), E("/admin/tours/walkups", "🚶", "Walk-ups", "walkups", { alert: "walkups" }), E("/admin/tours/availability", "🕙", "Availability", "availability"),
    E("/admin/tours/stats", "📈", "Statistics", "stats"), E("/admin/tours/timeline", "🧵", "Timeline", "timeline"), E("/admin/tours/notifications", "🔔", "Tour alerts", "notifications"),
  ] },
  { href: "/admin/makerfavor", label: "MakerFavor", color: "#65a30d", section: "chores", items: [
    E("/admin/makerfavor", "🧹", "To do", "todo", { exact: true }), E("/admin/makerfavor/log", "⏱️", "Hours", "log"), E("/admin/makerfavor/stats", "📊", "Stats", "stats"), E("/admin/makerfavor/achievements", "🏅", "Achievements", "achievements"),
  ] },
  { href: "/admin/users", label: "System", color: "#d97706", section: "admin", items: [
    E("/admin/users", "🔑", "Access", "users", { exact: true, full: true }), E("/admin/users/special", "⭐", "Special permissions", "special", { full: true }),
    E("/admin/services", "🗄️", "Database & storage", "setup", { exact: true }), E("/admin/services/seal", "✒️", "Signing certificate", "seal"), E("/admin/services/maps", "🗺️", "Google Maps", "maps"), E("/admin/services/captcha", "🛑", "Spam protection", "captcha"),
    E("/admin/services/pushover", "📱", "Alert delivery", "pushover"), E("/admin/services/api-keys", "🗝️", "API keys", "api-keys"), E("/admin/services/feed", "🦞", "Feed", "feed"), E("/admin/services/ai", "✨", "AI", "ai"), E("/admin/services/security", "🛡️", "Security headers", "security"),
    E("/admin/services/uploads", "📤", "Upload limits", "uploads"),
    E("/admin/services/audit", "📋", "Audit log", "audit"), E("/admin/services/pii", "🔍", "Audit PII", "pii", { full: true }), E("/admin/services/httplog", "🌐", "HTTP log", "httplog"),
    E("/admin/services/pgstats", "📈", "Database stats", "pgstats"), E("/admin/services/debug", "🐞", "Debug", "debug"),
  ] },
];

/** Members side menu: [href, icon, label]. */
export const MEMBER_MENU = [["/members", "🏠", "Home"], ["/members/waiver", "📝", "Membership agreement"], ["/members/handbook", "📖", "Handbook"], ["/members/directory", "🔎", "Member directory"], ["/members/classes", "🎓", "Classes"], ["/members/makerfavor", "🧹", "MakerFavor™"], ["/members/id", "🪪", "Gov ID"], ["/members/profile", "👤", "My profile"], ["/members/inbox", "✉️", "Messages"], ["/account", "⚙️", "My account"]] as const;

/** Every link in an item list, groups flattened. */
export const flat = (xs: Item[]): Entry[] => xs.flatMap((i) => ("items" in i ? flat(i.items) : [i]));
/** The menu a tab shows (permission-only entries left out). */
export const menuOf = (t: Tab): Item[] => t.items.flatMap((i): Item[] => ("items" in i ? [i] : i.hidden ? [] : [i]));
/** [tab, entry] for every entry in the manifest. */
export const ENTRIES = NAV.flatMap((t) => flat(t.items).map((e) => [t, e] as const));

// Side-menu zones: what you do day to day, what you look up, and what is rarely changed (System has its own areas). Anything not listed is the first zone.
export type Zone = { name: string; at: string[]; fold?: boolean };
const SYSTEM_ZONES: Zone[] = [
  { name: "Access", at: ["/admin/users", "/admin/users/special"] },
  { name: "Connections", at: ["/admin/services", "/admin/services/seal", "/admin/services/maps", "/admin/services/captcha", "/admin/services/pushover", "/admin/services/api-keys", "/admin/services/feed", "/admin/services/ai", "/admin/services/security"] },
  { name: "Rules", at: ["/admin/services/uploads"] },
  { name: "Logs", at: ["/admin/services/audit", "/admin/services/pii", "/admin/services/httplog"] },
  { name: "Health", at: ["/admin/services/pgstats", "/admin/services/debug"] },
];
const STANDARD = [
  { name: "Work", at: [] as string[] },
  { name: "Records", at: ["/admin/webmaster/analytics", "/admin/mailer/subscribers", "/admin/mailer/lists", "/admin/mailer/queue", "/admin/blog/media", "/admin/crm", "/admin/crm/guests", "/admin/crm/classes", "/admin/tours/stats", "/admin/tours/timeline", "/admin/makerfavor/stats"] },
  { name: "Settings", at: ["/admin/webmaster/calendar", "/admin/webmaster/board", "/admin/webmaster/financials", "/admin/webmaster/hours", "/admin/webmaster/menu", "/admin/services/privacy", "/admin/services/links", "/admin/webmaster/robots", "/admin/services/google-analytics", "/admin/mailer/forms", "/admin/mailer/settings", "/admin/blog/categories", "/admin/blog/authors", "/admin/crm/tools", "/admin/crm/skills", "/admin/crm/values", "/admin/crm/membership-classes", "/admin/crm/waiver", "/admin/crm/guest-agreement", "/admin/esign/templates", "/admin/esign/buckets", "/admin/tours/availability", "/admin/tours/notifications", "/admin/makerfavor/achievements"], fold: true },
];
export const zonesOf = (t: Tab): Zone[] => (t.section === "admin" ? SYSTEM_ZONES : STANDARD);
export const zoneOf = (t: Tab, i: Item) => { const k = "items" in i ? i.label : i.href, z = zonesOf(t); return (z.find((x) => x.at.includes(k)) ?? z[0]).name; };
