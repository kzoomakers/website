"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Collapse from "./collapse";
import { tabOf } from "./tabs";
import { useAlerts, type Alerts } from "./alerts";

type Item = { href: string; icon: string; label: string; exact?: boolean } | { icon: string; label: string; items: Item[] };

const WEBMASTER: Item[] = [
  { href: "/admin/webmaster", icon: "📄", label: "Pages", exact: true },
  { icon: "🧭", label: "Guided pages", items: [{ href: "/admin/webmaster/guided/index", icon: "🏠", label: "Homepage" }, { href: "/admin/webmaster/guided/about", icon: "ℹ️", label: "About Us" }, { href: "/admin/webmaster/guided/pricing", icon: "💲", label: "Pricing" }, { href: "/admin/webmaster/guided/team", icon: "🙌", label: "The Team" }, { href: "/admin/webmaster/guided/what_is_a_makerspace", icon: "💭", label: "Maker Philosophy" }, { href: "/admin/webmaster/guided/history", icon: "📜", label: "History" }, { href: "/admin/webmaster/guided/how-to", icon: "📚", label: "How To / Guides" }, { href: "/admin/webmaster/guided/why-kzoo-makers", icon: "🌟", label: "Why join us?" }, { href: "/admin/webmaster/guided/handbook", icon: "📘", label: "Handbook" }, { href: "/admin/webmaster/guided/contact", icon: "✉️", label: "Contact Us" }, { href: "/admin/webmaster/guided/tools-we-are-seeking-donations-kalamazoo", icon: "🧰", label: "Donate Tools" }, { href: "/admin/webmaster/guided/other-makerspaces", icon: "🗺️", label: "Other makerspaces" }, { href: "/admin/webmaster/guided/laser-shop", icon: "🔥", label: "Laser shop" }, { href: "/admin/webmaster/guided/wood-shop", icon: "🪵", label: "Wood shop" }, { href: "/admin/webmaster/guided/metal-shop", icon: "🔩", label: "Metal shop" }, { href: "/admin/webmaster/guided/3d-printing", icon: "🖨️", label: "3D printing" }, { href: "/admin/webmaster/guided/craft-room-kalamazoo", icon: "🧵", label: "Craft room" }, { href: "/admin/webmaster/guided/meeting-space", icon: "🤝", label: "Meeting space" }] },
  { href: "/admin/webmaster/calendar", icon: "📅", label: "Calendar" }, { href: "/admin/webmaster/board", icon: "👥", label: "Board" }, { href: "/admin/webmaster/financials", icon: "💰", label: "Financials" },
  { href: "/admin/webmaster/hours", icon: "🕙", label: "Hours & address" }, { href: "/admin/webmaster/menu", icon: "☰", label: "Menu" },
  { href: "/admin/services/privacy", icon: "🔒", label: "Privacy statement" }, { href: "/admin/services/links", icon: "🔗", label: "External links" },
  { href: "/admin/webmaster/robots", icon: "🤖", label: "Search engine settings" },
  { href: "/admin/webmaster/reviews", icon: "⭐", label: "Reviews" },
  { href: "/admin/webmaster/analytics", icon: "📈", label: "Analytics" },
  { href: "/admin/webmaster/handbook-updates", icon: "📣", label: "Handbook updates" },
];

const BLOG: Item[] = [
  { href: "/admin/blog", icon: "📝", label: "Posts", exact: true }, { href: "/admin/blog/categories", icon: "🏷️", label: "Categories" }, { href: "/admin/blog/authors", icon: "✍️", label: "Authors" },
  { href: "/admin/blog/media", icon: "🖼️", label: "Media" }, { href: "/admin/blog/comments", icon: "💬", label: "Comments" },
];
const MAIL: Item[] = [
  { href: "/admin/mail", icon: "📊", label: "Overview", exact: true }, { href: "/admin/mail/emails", icon: "✉️", label: "Emails" }, { href: "/admin/mail/forms", icon: "📝", label: "Signup forms" },
  { href: "/admin/mail/subscribers", icon: "👥", label: "Subscribers" }, { href: "/admin/mail/lists", icon: "📋", label: "Lists" }, { href: "/admin/mail/queue", icon: "⏳", label: "Queue" }, { href: "/admin/mail/settings", icon: "⚙️", label: "Settings" },
];
const FORMS: Item[] = [{ href: "/admin/forms", icon: "📬", label: "Messages" }];
const CRM: Item[] = [{ href: "/admin/crm", icon: "👥", label: "People", exact: true }, { href: "/admin/crm/approvals", icon: "✅", label: "New members" }, { href: "/admin/crm/classes", icon: "🎓", label: "Classes" }, { href: "/admin/crm/tools", icon: "🔧", label: "Tools & sign-offs" }, { href: "/admin/crm/skills", icon: "🛠️", label: "Skills" }, { href: "/admin/crm/values", icon: "🏷️", label: "Profile options" }, { href: "/admin/crm/waiver", icon: "📜", label: "Membership agreement" }, { href: "/admin/crm/guest-agreement", icon: "🪪", label: "Guest agreement" }, { href: "/admin/crm/guests", icon: "🧑‍🤝‍🧑", label: "Guests" }];
const SIGNED: Item[] = [{ href: "/admin/signed-docs", icon: "📄", label: "Documents", exact: true }, { href: "/admin/signed-docs/new", icon: "➕", label: "New document" }, { href: "/admin/signed-docs/templates", icon: "📑", label: "Templates" }, { href: "/admin/signed-docs/buckets", icon: "🗂️", label: "Folders" }];
const TOURS: Item[] = [{ href: "/admin/tours", icon: "🗓️", label: "Bookings", exact: true }, { href: "/admin/tours/walkups", icon: "🚶", label: "Walk-ups" }, { href: "/admin/tours/availability", icon: "🕙", label: "Availability" }, { href: "/admin/tours/stats", icon: "📈", label: "Stats" }, { href: "/admin/tours/timeline", icon: "🧵", label: "Timeline" }, { href: "/admin/tours/notifications", icon: "🔔", label: "Tour alerts" }];
const CHORES: Item[] = [{ href: "/admin/makerfavor", icon: "🧹", label: "To do", exact: true }, { href: "/admin/makerfavor/log", icon: "⏱️", label: "Hours" }, { href: "/admin/makerfavor/stats", icon: "📊", label: "Stats" }, { href: "/admin/makerfavor/achievements", icon: "🏅", label: "Achievements" }];
const SYSTEM: Item[] = [{ href: "/admin/users", icon: "🔑", label: "Access", exact: true }, { href: "/admin/users/special", icon: "⭐", label: "Special permissions" }, { href: "/admin/services", icon: "⚙️", label: "Setup", exact: true }, { href: "/admin/services/audit", icon: "📋", label: "Audit log" }, { href: "/admin/services/ntfy", icon: "📱", label: "Alert delivery" }, { href: "/admin/services/api-keys", icon: "🗝️", label: "API keys" }, { href: "/admin/services/ai", icon: "✨", label: "AI" }, { href: "/admin/services/google-analytics", icon: "📊", label: "Analytics & cookies" },
  { icon: "🩺", label: "Diagnostics", items: [{ href: "/admin/services/debug", icon: "🐞", label: "Debug" }, { href: "/admin/services/httplog", icon: "🌐", label: "HTTP log" }, { href: "/admin/services/pgstats", icon: "📈", label: "Database stats" }, { href: "/admin/services/security", icon: "🛡️", label: "Security headers" }] }];
const MENUS: [string, Item[]][] = [["/admin/webmaster", WEBMASTER], ["/admin/blog", BLOG], ["/admin/mail", MAIL], ["/admin/forms", FORMS], ["/admin/crm", CRM], ["/admin/signed-docs", SIGNED], ["/admin/tours", TOURS], ["/admin/makerfavor", CHORES], ["/admin/users", SYSTEM]];

/** Page name for a URL (menu label), used for the browser tab title. */
export const labelOf = (here: string): string | undefined => {
  const all = (xs: Item[]): [string, string][] => xs.flatMap((i) => ("items" in i ? all(i.items) : [[i.href, i.label] as [string, string]]));
  const hits = MENUS.flatMap(([, m]) => all(m)).filter(([h]) => here === h || here.startsWith(h + "/")).sort((a, b) => b[0].length - a[0].length);
  return hits[0]?.[1];
};

const hrefs = (i: Item): string[] => ("items" in i ? i.items.flatMap(hrefs) : [i.href]);

// A link is current on its own page and on pages below it (a post being edited), unless a longer sibling link matches better.
const current = (href: string, here: string, all: string[]) =>
  (here === href || here.startsWith(href + "/")) && !all.some((o) => o.length > href.length && (here === o || here.startsWith(o + "/")));

// Menu pages with a queue, and the count of what is waiting in each.
const WAITING: Record<string, keyof Alerts> = { "/admin/webmaster/reviews": "reviews", "/admin/blog/comments": "comments", "/admin/forms": "forms", "/admin/crm/approvals": "applicants", "/admin/tours/walkups": "walkups" };

function Node({ item, here, all, n }: { item: Item; here: string; all: string[]; n: Alerts | null }) {
  const [open, setOpen] = useState(false); // tap toggles on phones (no hover there; iOS doesn't focus buttons); hooks stay above the early return
  if (!("items" in item))
    return <Link href={item.href} className="adm-link" aria-current={(item.exact ? here === item.href : current(item.href, here, all)) ? "page" : undefined}><span aria-hidden>{item.icon}</span>{item.label}{(n?.[WAITING[item.href]] ?? 0) > 0 && <span className="adm-n" title={`${n![WAITING[item.href]]} waiting`}>{n![WAITING[item.href]]}<span className="sr-only"> waiting</span></span>}</Link>;
  // Hover or keyboard focus opens the flyout; the group is highlighted while one of its pages is open.
  const active = hrefs(item).some((h) => current(h, here, all));
  return (
    <div className={"adm-group" + (open ? " open" : "")}>
      <button className="adm-link" aria-haspopup="true" onClick={() => setOpen(!open)} aria-current={active ? "true" : undefined}><span aria-hidden>{item.icon}</span>{item.label}<span className="adm-caret" aria-hidden>▸</span></button>
      <div className="adm-fly">{item.items.map((c) => <Node key={c.label} item={c} here={here} all={all} n={n} />)}</div>
    </div>
  );
}

/** The left menu for whichever admin section you are in, plus the account menu at the bottom (same on every page). */
export default function Nav({ admin, user }: { admin: boolean; user: ReactNode }) {
  const here = usePathname(), n = useAlerts(here);
  const tab = tabOf(here), links = (MENUS.find(([p]) => p === tab)?.[1] ?? []).filter((l) => admin || !("href" in l && l.href.endsWith("/services")));
  const all = links.flatMap(hrefs);
  return (
    <Collapse>
      {links.map((l) => <Node key={l.label} item={l} here={here} all={all} n={n} />)}
      <span className="adm-sp" />
      <a className="adm-link" href="/" target="_blank">↗ View site</a>
      {user}
    </Collapse>
  );
}
