import { NAV, ENTRIES } from "@/lib/nav-manifest";

// Top-level admin sections: path, label, ribbon colour, and the permission section that unlocks it.
export const TABS = NAV.map((t) => [t.href, t.label, t.color, t.section] as const);

const under = (here: string, p: string) => here === p || here.startsWith(p + "/");
/** The tab path (a TABS entry) that owns this admin URL, or undefined: the tab whose menu has the longest matching link (public-content pages live under /admin/services but show in Website), else the tab's own URL. */
export const tabOf = (here: string) =>
  ENTRIES.filter(([, e]) => under(here, e.href)).sort((a, b) => b[1].href.length - a[1].href.length)[0]?.[0].href ?? TABS.find(([h]) => under(here, h))?.[0];
