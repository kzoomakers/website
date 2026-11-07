export type MenuItem = { label: string; href?: string; items?: MenuItem[] };
/** Where a removed link lived: the dropdowns above it (label + position) and its own position. */
export type Removed = { path: { label: string; index: number }[]; index: number; item: MenuItem };

// Legacy menu links look like "about.html", "/about" or "/"; all map to a slug.
export const slugOfHref = (h = "") => h.split(/[?#]/)[0].replace(/^\/+/, "").replace(/\.html$/, "") || "index";

export const count = (m: MenuItem[], slug: string): number =>
  m.reduce((n, i) => n + (!i.items && slugOfHref(i.href) === slug ? 1 : 0) + (i.items ? count(i.items, slug) : 0), 0);

/** Menu without links to `slug` (and dropdowns left empty by that), plus what was removed so it can be put back. */
export function removeFor(menu: MenuItem[], slug: string, path: Removed["path"] = [], removed: Removed[] = []) {
  const out = menu.flatMap((i, index): MenuItem[] => {
    if (!i.items) {
      if (slugOfHref(i.href) !== slug) return [i];
      removed.push({ path, index, item: i });
      return [];
    }
    const items = removeFor(i.items, slug, [...path, { label: i.label, index }], removed).menu;
    return items.length || !i.items.length ? [{ ...i, items }] : [];
  });
  return { menu: out, removed };
}

/** Inverse of removeFor; recreates dropdowns that were dropped for being empty. Skips links already present. */
export function restoreMenu(menu: MenuItem[], removed: Removed[]): MenuItem[] {
  const m: MenuItem[] = structuredClone(menu);
  for (const r of removed) {
    let list = m;
    for (const p of r.path) {
      let d = list.find((x) => x.items && x.label === p.label);
      if (!d) { d = { label: p.label, items: [] }; list.splice(Math.min(p.index, list.length), 0, d); }
      list = d.items!;
    }
    if (!list.some((x) => !x.items && x.href === r.item.href)) list.splice(Math.min(r.index, list.length), 0, r.item);
  }
  return m;
}
