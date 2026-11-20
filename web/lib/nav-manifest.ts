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
  zone?: string; // side-menu heading (one of the tab's zones)
};
export type Item = Entry | { icon: string; label: string; items: Item[] };
export type Tab = { href: string; label: string; section: Section; zones: string[]; items: Item[] };

const E = (href: string, icon: string, label: string, key?: string, more: Partial<Entry> = {}): Entry => ({ href, icon, label, key, ...more });
const G = (href: string, icon: string, label: string): Entry => E(`/admin/webmaster/guided/${href}`, icon, label);

// Guided pages are listed on the Pages screen, not in the menu; kept here so their browser titles stay.
export const GUIDED = [G("index", "🏠", "Homepage"), G("about", "ℹ️", "About Us"), G("pricing", "💲", "Pricing"), G("team", "🙌", "The Team"), G("what_is_a_makerspace", "💭", "Maker Philosophy"), G("history", "📜", "History"), G("how-to", "📚", "How To / Guides"), G("why-kzoo-makers", "🌟", "Why join us?"), G("handbook", "📘", "Handbook"), G("contact", "✉️", "Contact Us"), G("tools-we-are-seeking-donations-kalamazoo", "🧰", "Donate Tools"), G("other-makerspaces", "🗺️", "Other makerspaces"), G("laser-shop", "🔥", "Laser shop"), G("wood-shop", "🪵", "Wood shop"), G("metal-shop", "🔩", "Metal shop"), G("3d-printing", "🖨️", "3D printing"), G("craft-room-kalamazoo", "🧵", "Craft room"), G("meeting-space", "🤝", "Meeting space")].map((e) => ({ ...e, hidden: true }));

export const NAV: Tab[] = [
  { href: "/admin/webmaster", label: "Website", section: "webmaster", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/webmaster", "📄", "Pages", "pages", { exact: true }),
    E("/admin/webmaster/guided", "", "Guided pages", "guided", { hidden: true }),
    ...GUIDED,
    E("/admin/webmaster/calendar", "📅", "Calendar", "calendar", { zone: "Settings" }), E("/admin/webmaster/board", "👥", "Board", "board", { zone: "Settings" }), E("/admin/webmaster/financials", "💰", "Financials", "financials", { zone: "Settings" }),
    E("/admin/webmaster/hours", "🕙", "Hours & address", "hours", { zone: "Settings" }), E("/admin/webmaster/menu", "☰", "Menu", "menu", { zone: "Settings" }),
    E("/admin/services/privacy", "🔒", "Privacy statement", "privacy", { zone: "Settings", section: "admin" }), E("/admin/services/links", "🔗", "External links", "links", { zone: "Settings", section: "admin" }),
    E("/admin/webmaster/robots", "🤖", "Search engine settings", "robots", { zone: "Settings" }),
    E("/admin/services/google-analytics", "📊", "Analytics & cookies", "google-analytics", { zone: "Settings", section: "admin" }),
    E("/admin/webmaster/reviews", "⭐", "Reviews", "reviews", { alert: "reviews" }),
    E("/admin/webmaster/analytics", "📈", "Site analytics", "analytics", { zone: "Records" }),
    E("/admin/webmaster/handbook-updates", "📣", "Handbook updates", "handbook-updates"),
  ] },
  { href: "/admin/mailer", label: "Email", section: "mail", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/mailer", "📊", "Overview", "overview", { exact: true }), E("/admin/mailer/emails", "✉️", "Emails", "emails", { also: ["/admin/mailer/email"] }), E("/admin/mailer/forms", "📝", "Signup forms", "forms", { zone: "Settings" }),
    E("/admin/mailer/subscribers", "👥", "Subscribers", "subscribers", { zone: "Records" }), E("/admin/mailer/lists", "📋", "Lists", "lists", { zone: "Records" }), E("/admin/mailer/queue", "⏳", "Queue", "queue", { zone: "Records" }), E("/admin/mailer/settings", "⚙️", "Settings", "settings", { zone: "Settings" }),
    E("/admin/mailer/tracking", "", "Tracking", "tracking", { hidden: true }),
  ] },
  { href: "/admin/blog", label: "Blog", section: "blog", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/blog", "📝", "Posts", "posts", { exact: true }), E("/admin/blog/categories", "🏷️", "Categories", "categories", { zone: "Settings" }), E("/admin/blog/authors", "✍️", "Authors", "authors", { zone: "Settings" }),
    E("/admin/blog/media", "🖼️", "Media", "media", { zone: "Records" }), E("/admin/blog/comments", "💬", "Comments", "comments", { alert: "comments" }),
  ] },
  { href: "/admin/forms", label: "Messages", section: "forms", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/forms", "📬", "All messages", "messages", { exact: true, pageLabel: "Messages", alert: "forms" }), E("/admin/forms/contact", "✉️", "Contact"), E("/admin/forms/board", "🏛️", "Board"), E("/admin/forms/donation", "🎁", "Donations"),
  ] },
  { href: "/admin/crm", label: "People", section: "crm", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/crm", "👥", "People", "people", { zone: "Records", exact: true }), E("/admin/crm/guests", "🧑‍🤝‍🧑", "Guests", "guests", { zone: "Records" }), E("/admin/crm/approvals", "✅", "New members", "approvals", { alert: "applicants" }), E("/admin/crm/classes", "🎓", "Classes", "classes", { zone: "Records" }),
    E("/admin/crm/tools", "🔧", "Tools & sign-offs", "tools", { zone: "Settings" }), E("/admin/crm/skills", "🛠️", "Skills", "skills", { zone: "Settings" }), E("/admin/crm/values", "🏷️", "Profile options", "values", { zone: "Settings" }),
    E("/admin/crm/membership-classes", "💳", "Membership classes", "membership-classes", { section: "admin", zone: "Settings" }),
    E("/admin/crm/waiver", "📜", "Membership agreement", "waiver", { zone: "Settings" }), E("/admin/crm/guest-agreement", "🪪", "Guest agreement", "guest-agreement", { zone: "Settings" }), E("/admin/crm/id-renewals", "🪪", "ID renewals", "id-renewals"),
  ] },
  { href: "/admin/esign", label: "SignDocs", section: "board", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/esign", "📄", "Documents", "documents", { exact: true }), E("/admin/esign/new", "➕", "New document", "new"), E("/admin/esign/templates", "📑", "Templates", "templates", { zone: "Settings" }), E("/admin/esign/buckets", "🗂️", "Folders", "buckets", { zone: "Settings" }),
  ] },
  { href: "/admin/tours", label: "Tours", section: "tours", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/tours", "🗓️", "Bookings", "bookings", { exact: true }), E("/admin/tours/walkups", "🚶", "Walk-ups", "walkups", { alert: "walkups" }), E("/admin/tours/availability", "🕙", "Availability", "availability", { zone: "Settings" }),
    E("/admin/tours/stats", "📈", "Statistics", "stats", { zone: "Records" }), E("/admin/tours/timeline", "🧵", "Timeline", "timeline", { zone: "Records" }), E("/admin/tours/notifications", "🔔", "Tour alerts", "notifications", { zone: "Settings" }),
  ] },
  { href: "/admin/makerfavor", label: "MakerFavor", section: "chores", zones: ["Work", "Records", "Settings"], items: [
    E("/admin/makerfavor", "🧹", "To do", "todo", { exact: true }), E("/admin/makerfavor/log", "⏱️", "Hours", "log"), E("/admin/makerfavor/stats", "📊", "Stats", "stats", { zone: "Records" }), E("/admin/makerfavor/achievements", "🏅", "Achievements", "achievements", { zone: "Settings" }),
  ] },
  { href: "/admin/users", label: "System", section: "admin", zones: ["Access", "Connections", "Rules", "Logs", "Health"], items: [
    E("/admin/users", "🔑", "Access", "users", { zone: "Access", exact: true, full: true }), E("/admin/users/special", "⭐", "Special permissions", "special", { zone: "Access", full: true }),
    E("/admin/services", "🗄️", "Database & storage", "setup", { zone: "Connections", exact: true }), E("/admin/services/seal", "✒️", "Signing certificate", "seal", { zone: "Connections" }), E("/admin/services/maps", "🗺️", "Google Maps", "maps", { zone: "Connections" }), E("/admin/services/captcha", "🛑", "Spam protection", "captcha", { zone: "Connections" }),
    E("/admin/services/pushover", "📱", "Alert delivery", "pushover", { zone: "Connections" }), E("/admin/services/api-keys", "🗝️", "API keys", "api-keys", { zone: "Connections" }), E("/admin/services/feed", "🦞", "Feed", "feed", { zone: "Connections" }), E("/admin/services/ai", "✨", "AI", "ai", { zone: "Connections" }), E("/admin/services/security", "🛡️", "Security headers", "security", { zone: "Connections" }),
    E("/admin/services/uploads", "📤", "Upload limits", "uploads", { zone: "Rules" }),
    E("/admin/services/audit", "📋", "Audit log", "audit", { zone: "Logs" }), E("/admin/services/pii", "🔍", "Audit PII", "pii", { zone: "Logs", full: true }), E("/admin/services/httplog", "🌐", "HTTP log", "httplog", { zone: "Logs" }),
    E("/admin/services/pgstats", "📈", "Database stats", "pgstats", { zone: "Health" }), E("/admin/services/debug", "🐞", "Debug", "debug", { zone: "Health" }),
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

// Side-menu zones: each entry names its zone; no zone means the tab's first one. Settings is folded away unless you are on one of its pages.
export type Zone = { name: string; fold?: boolean };
export const zonesOf = (t: Tab): Zone[] => t.zones.map((name) => ({ name, fold: name === "Settings" }));
export const zoneOf = (t: Tab, i: Item) => ("items" in i ? undefined : i.zone) ?? t.zones[0];
