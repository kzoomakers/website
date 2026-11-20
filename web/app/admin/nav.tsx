"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Collapse from "./collapse";
import { tabOf } from "./tabs";
import { levelFor, pageOf, type Perms } from "@/lib/access";
import { useAlerts } from "./alerts";
import { NAV, menuOf, zoneOf, zonesOf, type Item } from "@/lib/nav-manifest";

const MENUS: [string, Item[]][] = NAV.map((t) => [t.href, menuOf(t)]);

/** Page name for a URL (menu label), used for the browser tab title. */
export const labelOf = (here: string): string | undefined => {
  const all = (xs: Item[]): [string, string][] => xs.flatMap((i) => ("items" in i ? all(i.items) : [[i.href, i.label] as [string, string]]));
  const hits = MENUS.flatMap(([, m]) => all(m)).filter(([h]) => here === h || here.startsWith(h + "/")).sort((a, b) => b[0].length - a[0].length);
  return hits[0]?.[1];
};

type Alerts = NonNullable<ReturnType<typeof useAlerts>>;
const hrefs = (i: Item): string[] => ("items" in i ? i.items.flatMap(hrefs) : [i.href]);

// A link is current on its own page and on pages below it (a post being edited), unless a longer sibling link matches better.
const current = (href: string, here: string, all: string[]) =>
  (here === href || here.startsWith(href + "/")) && !all.some((o) => o.length > href.length && (here === o || here.startsWith(o + "/")));

function Node({ item, here, all, n }: { item: Item; here: string; all: string[]; n: Alerts | null }) {
  const [open, setOpen] = useState(false); // tap toggles on phones (no hover there; iOS doesn't focus buttons); hooks stay above the early return
  if (!("items" in item)) {
    const w = (item.alert && n?.[item.alert]) || 0;
    return <Link href={item.href} className="adm-link" aria-current={(item.exact ? here === item.href : current(item.href, here, all)) ? "page" : undefined}><span aria-hidden>{item.icon}</span>{item.label}{w > 0 && <span className="adm-n" title={`${w} waiting`}>{w}<span className="sr-only"> waiting</span></span>}</Link>;
  }
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
export default function Nav({ admin, audit = false, perms, user }: { admin: boolean; audit?: boolean; perms: Perms; user: ReactNode }) {
  const here = usePathname(), n = useAlerts(here);
  // Only the pages this person may open (a page-only grant must not show the rest of the section).
  const may = (i: Item): boolean => { if ("items" in i) return i.items.some(may); const pg = pageOf(i.href); if (audit && pg?.key === "pii") return true; /* on the Audit PII special list */ return !pg || !!levelFor(perms, pg.section, pg.key); };
  const prune = (i: Item): Item => ("items" in i ? { ...i, items: i.items.filter(may) } : i);
  const tab = tabOf(here), tabDef = NAV.find((t) => t.href === tab) ?? NAV[0], links = (MENUS.find(([p]) => p === tab)?.[1] ?? []).filter((l) => (admin || !("href" in l && l.href.endsWith("/system"))) && may(l)).map(prune);
  const all = links.flatMap(hrefs), zoned = new Set(links.map((l) => zoneOf(tabDef, l))).size > 1;
  return (
    <Collapse>
      {zonesOf(tabDef).map((z) => {
        const zl = links.filter((l) => zoneOf(tabDef, l) === z.name); if (!zl.length) return null;
        const body = zl.map((l) => <Node key={l.label} item={l} here={here} all={all} n={n} />);
        if (!zoned) return body; // one zone only: no headings
        // A folded zone (Settings) stays closed unless you are on one of its pages.
        return z.fold ? <details key={z.name} className="adm-zone" open={zl.flatMap(hrefs).some((h) => current(h, here, all))}><summary>{z.name}</summary>{body}</details> : <div key={z.name} className="adm-zone"><span className="adm-zh">{z.name}</span>{body}</div>;
      })}
      <span className="adm-sp" />
      {!links.length && <img className="adm-ease" src="/images/atease.webp" alt="" />}
      <a className="adm-link" href="/" target="_blank">↗ View site</a>
      {user}
    </Collapse>
  );
}
