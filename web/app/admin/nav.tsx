"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

type Item = { href: string; icon: string; label: string; exact?: boolean } | { icon: string; label: string; items: Item[] };

const WEBMASTER: Item[] = [
  { icon: "📄", label: "Pages", items: [
    { href: "/admin/webmaster", icon: "✏️", label: "Custom" },
    { icon: "🧭", label: "Guided", items: [{ href: "/admin/webmaster/guided/index", icon: "🏠", label: "Homepage" }, { href: "/admin/webmaster/calendar", icon: "📅", label: "Calendar" }, { href: "/admin/webmaster/board", icon: "👥", label: "Board" },
      { icon: "📖", label: "Learn More", items: [{ href: "/admin/webmaster/guided/about", icon: "ℹ️", label: "About Us" }, { href: "/admin/webmaster/guided/pricing", icon: "💲", label: "Pricing" }, { href: "/admin/webmaster/guided/team", icon: "🙌", label: "The Team" }, { href: "/admin/webmaster/guided/what_is_a_makerspace", icon: "💭", label: "Maker Philosophy" }, { href: "/admin/webmaster/guided/history", icon: "📜", label: "History" }, { href: "/admin/webmaster/guided/how-to", icon: "📚", label: "How To / Guides" }, { href: "/admin/webmaster/guided/why-kzoo-makers", icon: "🌟", label: "Why join us?" }] },
      { href: "/admin/webmaster/guided/handbook", icon: "📘", label: "Handbook" },
      { icon: "📣", label: "Reach Out", items: [{ href: "/admin/webmaster/guided/contact", icon: "✉️", label: "Contact Us" }, { href: "/admin/webmaster/guided/tools-we-are-seeking-donations-kalamazoo", icon: "🧰", label: "Donate Tools" }] },
      { href: "/admin/webmaster/guided/other-makerspaces", icon: "🗺️", label: "Other makerspaces" },
      { icon: "🧭", label: "Explore Us", items: [{ href: "/admin/webmaster/guided/laser-shop", icon: "🔥", label: "Laser shop" }, { href: "/admin/webmaster/guided/wood-shop", icon: "🪵", label: "Wood shop" }, { href: "/admin/webmaster/guided/metal-shop", icon: "🔩", label: "Metal shop" }, { href: "/admin/webmaster/guided/3d-printing", icon: "🖨️", label: "3D printing" }, { href: "/admin/webmaster/guided/craft-room-kalamazoo", icon: "🧵", label: "Craft room" }, { href: "/admin/webmaster/guided/meeting-space", icon: "🤝", label: "Meeting space" }] }] },
  ] },
  { icon: "🛠️", label: "Site Config", items: [
    { href: "/admin/webmaster/hours", icon: "🕙", label: "Hours & address" },
    { href: "/admin/webmaster/menu", icon: "☰", label: "Menu" },
    { href: "/admin/webmaster/robots", icon: "🤖", label: "robots.txt" },
  ] },
  { href: "/admin/webmaster/reviews", icon: "⭐", label: "Reviews" },
];

const BLOG: Item[] = [
  { href: "/admin/blog", icon: "📝", label: "Posts" }, { href: "/admin/blog/categories", icon: "🏷️", label: "Categories" }, { href: "/admin/blog/authors", icon: "✍️", label: "Authors" },
  { href: "/admin/blog/media", icon: "🖼️", label: "Media" }, { href: "/admin/blog/comments", icon: "💬", label: "Comments" },
];
const MAIL: Item[] = [
  { href: "/admin/mail", icon: "🏠", label: "Home", exact: true }, { href: "/admin/mail/emails", icon: "✉️", label: "Emails" }, { href: "/admin/mail/forms", icon: "📝", label: "Forms" },
  { href: "/admin/mail/subscribers", icon: "👥", label: "Subscribers" }, { href: "/admin/mail/lists", icon: "📋", label: "Lists" }, { href: "/admin/mail/queue", icon: "⏳", label: "Queue" }, { href: "/admin/mail/settings", icon: "⚙️", label: "Settings" },
];
const FORMS: Item[] = [{ href: "/admin/forms", icon: "📬", label: "Inbox" }];
const CRM: Item[] = [{ href: "/admin/crm", icon: "👥", label: "People" }, { href: "/admin/crm/approvals", icon: "✅", label: "New members" }, { href: "/admin/crm/waiver", icon: "📜", label: "Membership agreement" }, { href: "/admin/crm/skills", icon: "🛠️", label: "Skills" }, { href: "/admin/crm/values", icon: "🏷️", label: "Profile values" }, { href: "/admin/crm/tools", icon: "🔧", label: "Tools & authorizations" }, { href: "/admin/crm/classes", icon: "🎓", label: "Classes" }];
const SIGNED: Item[] = [{ href: "/admin/signed-docs", icon: "📄", label: "Papers", exact: true }, { href: "/admin/signed-docs/new", icon: "➕", label: "New paper" }, { href: "/admin/signed-docs/templates", icon: "📑", label: "Templates" }, { href: "/admin/signed-docs/buckets", icon: "🗂️", label: "Buckets" }];
const TOURS: Item[] = [{ href: "/admin/tours", icon: "🗓️", label: "Bookings", exact: true }, { href: "/admin/tours/walkups", icon: "🚶", label: "Walk-ups" }, { href: "/admin/tours/availability", icon: "🕙", label: "Availability" }, { href: "/admin/tours/timeline", icon: "🕘", label: "Timeline" }, { href: "/admin/tours/notifications", icon: "🔔", label: "Notifications" }];
const CHORES: Item[] = [{ href: "/admin/chores", icon: "🧹", label: "To do", exact: true }, { href: "/admin/chores/log", icon: "⏱️", label: "Hours log" }, { href: "/admin/chores/stats", icon: "📊", label: "Stats" }, { href: "/admin/chores/achievements", icon: "🏅", label: "Achievements" }];
const USERS: Item[] = [{ href: "/admin/users", icon: "🔑", label: "People & access" }, { href: "/admin/services", icon: "⚙️", label: "Services", exact: true }, { href: "/admin/services/audit", icon: "🕘", label: "Audit log" }, { href: "/admin/services/ntfy", icon: "🔔", label: "Notifications (ntfy)" }, { href: "/admin/services/ai", icon: "✨", label: "AI" }, { href: "/admin/services/debug", icon: "🐞", label: "Debug" }, { href: "/admin/services/httplog", icon: "🌐", label: "HTTP log" }, { href: "/admin/services/links", icon: "🔗", label: "External links" }];
const MENUS: [string, Item[]][] = [["/admin/webmaster", WEBMASTER], ["/admin/blog", BLOG], ["/admin/mail", MAIL], ["/admin/forms", FORMS], ["/admin/crm", CRM], ["/admin/signed-docs", SIGNED], ["/admin/tours", TOURS], ["/admin/chores", CHORES], ["/admin/users", USERS], ["/admin/services", USERS]];

const hrefs = (i: Item): string[] => ("items" in i ? i.items.flatMap(hrefs) : [i.href]);

// A link is current on its own page and on pages below it (a post being edited), unless a longer sibling link matches better.
const current = (href: string, here: string, all: string[]) =>
  (here === href || here.startsWith(href + "/")) && !all.some((o) => o.length > href.length && (here === o || here.startsWith(o + "/")));

function Node({ item, here, all }: { item: Item; here: string; all: string[] }) {
  if (!("items" in item))
    return <Link href={item.href} className="adm-link" aria-current={(item.exact ? here === item.href : current(item.href, here, all)) ? "page" : undefined}><span aria-hidden>{item.icon}</span>{item.label}</Link>;
  // Hover or keyboard focus opens the flyout; the group is highlighted while one of its pages is open.
  const active = hrefs(item).some((h) => current(h, here, all));
  return (
    <div className="adm-group">
      <button className="adm-link" aria-haspopup="true" aria-current={active ? "true" : undefined}><span aria-hidden>{item.icon}</span>{item.label}<span className="adm-caret" aria-hidden>▸</span></button>
      <div className="adm-fly">{item.items.map((c) => <Node key={c.label} item={c} here={here} all={all} />)}</div>
    </div>
  );
}

/** The left menu for whichever admin section you are in, plus the account menu at the bottom (same on every page). */
export default function Nav({ admin, user }: { admin: boolean; user: ReactNode }) {
  const here = usePathname();
  const links = (MENUS.find(([p]) => here.startsWith(p))?.[1] ?? []).filter((l) => admin || !("href" in l && l.href.endsWith("/services")));
  const all = links.flatMap(hrefs);
  return (
    <>
      {links.map((l) => <Node key={l.label} item={l} here={here} all={all} />)}
      <span className="adm-sp" />
      <a className="adm-link" href="/" target="_blank">↗ View site</a>
      {user}
    </>
  );
}
