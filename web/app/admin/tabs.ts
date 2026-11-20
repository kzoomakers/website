import { GROUPS, NAV, ENTRIES } from "@/lib/nav-manifest";

// Admin sections (one per permission section): path, label, and the section that unlocks it.
export const TABS = NAV.map((t) => [t.href, t.label, t.section] as const);

const under = (here: string, p: string) => here === p || here.startsWith(p + "/");
/** The section tab path (a TABS entry) that owns this admin URL, or undefined: the tab whose menu has the longest matching link (public-content pages live under /admin/system but show in Website), else the tab's own URL. */
export const tabOf = (here: string) =>
  ENTRIES.filter(([, e]) => under(here, e.href)).sort((a, b) => b[1].href.length - a[1].href.length)[0]?.[0].href ?? TABS.find(([h]) => under(here, h))?.[0];

/** The top-bar group an admin URL belongs to (Home for the landing page and /admin itself). */
export const groupOf = (here: string) => {
  const tab = NAV.find((t) => t.href === tabOf(here));
  return GROUPS.find((g) => (tab ? g.sections.includes(tab.section) : false)) ?? GROUPS[0];
};

/** The groups to show in the top bar and where each opens: Home always, the others when you can open a section in them, on the first page you may use. `allowed` maps a section to that page ("" if none). */
export const visibleGroups = (allowed: Record<string, string>) =>
  GROUPS.flatMap((g) => {
    const s = g.sections.find((x) => allowed[x] !== undefined);
    return g.sections.length && s === undefined ? [] : [{ group: g, href: g.sections.map((x) => allowed[x]).find(Boolean) || g.href || NAV.find((t) => t.section === s)!.href }];
  });
