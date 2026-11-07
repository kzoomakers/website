"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; icon: string; label: string } | { icon: string; label: string; items: Item[] };

const LINKS: Item[] = [
  { icon: "📄", label: "Pages", items: [
    { href: "/webmaster", icon: "✏️", label: "Custom" },
    { icon: "🧭", label: "Guided", items: [{ href: "/webmaster/guided/index", icon: "🏠", label: "Homepage" }, { href: "/webmaster/calendar", icon: "📅", label: "Calendar" }, { href: "/webmaster/board", icon: "👥", label: "Board" },
      { icon: "📖", label: "Learn More", items: [{ href: "/webmaster/guided/about", icon: "ℹ️", label: "About Us" }, { href: "/webmaster/guided/pricing", icon: "💲", label: "Pricing" }, { href: "/webmaster/guided/team", icon: "🙌", label: "The Team" }, { href: "/webmaster/guided/what_is_a_makerspace", icon: "💭", label: "Maker Philosophy" }, { href: "/webmaster/guided/history", icon: "📜", label: "History" }, { href: "/webmaster/guided/how-to", icon: "📚", label: "How To / Guides" }, { href: "/webmaster/guided/why-kzoo-makers", icon: "🌟", label: "Why join us?" }] },
      { href: "/webmaster/guided/handbook", icon: "📘", label: "Handbook" },
      { icon: "📣", label: "Reach Out", items: [{ href: "/webmaster/guided/contact", icon: "✉️", label: "Contact Us" }, { href: "/webmaster/guided/tools-we-are-seeking-donations-kalamazoo", icon: "🧰", label: "Donate Tools" }] },
      { href: "/webmaster/guided/other-makerspaces", icon: "🗺️", label: "Other makerspaces" },
      { icon: "🧭", label: "Explore Us", items: [{ href: "/webmaster/guided/laser-shop", icon: "🔥", label: "Laser shop" }, { href: "/webmaster/guided/wood-shop", icon: "🪵", label: "Wood shop" }, { href: "/webmaster/guided/metal-shop", icon: "🔩", label: "Metal shop" }, { href: "/webmaster/guided/3d-printing", icon: "🖨️", label: "3D printing" }, { href: "/webmaster/guided/craft-room-kalamazoo", icon: "🧵", label: "Craft room" }, { href: "/webmaster/guided/meeting-space", icon: "🤝", label: "Meeting space" }] }] },
  ] },
  { href: "/webmaster/hours", icon: "🕙", label: "Hours & address" },
  { href: "/webmaster/menu", icon: "☰", label: "Menu" },
  { href: "/webmaster/audit", icon: "🕘", label: "Audit log" },
  { href: "/webmaster/setup", icon: "⚙️", label: "Services" },
];

const hrefs = (i: Item): string[] => ("items" in i ? i.items.flatMap(hrefs) : [i.href]);

function Node({ item, here }: { item: Item; here: string }) {
  if (!("items" in item))
    return <Link href={item.href} className="adm-link" aria-current={here === item.href ? "page" : undefined}><span aria-hidden>{item.icon}</span>{item.label}</Link>;
  // Hover or keyboard focus opens the flyout; the group is highlighted while one of its pages is open.
  const active = hrefs(item).some((h) => (h === "/webmaster" ? here === h : here.startsWith(h)));
  return (
    <div className="adm-group">
      <button className="adm-link" aria-haspopup="true" aria-current={active ? "true" : undefined}><span aria-hidden>{item.icon}</span>{item.label}<span className="adm-caret" aria-hidden>▸</span></button>
      <div className="adm-fly">{item.items.map((c) => <Node key={c.label} item={c} here={here} />)}</div>
    </div>
  );
}

export default function Nav() {
  const here = usePathname();
  return (
    <>
      {LINKS.map((l) => <Node key={l.label} item={l} here={here} />)}
      <span className="adm-sp" />
      <a className="adm-link" href="/" target="_blank">↗ View site</a>
    </>
  );
}
