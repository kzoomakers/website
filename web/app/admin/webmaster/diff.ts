import type { MenuItem } from "@/lib/menu";

// Menu tree -> one line per item ("Learn More › Pricing  →  /pricing.html"), so a line diff reads like the menu.
const flat = (m: MenuItem[], pre = ""): string[] =>
  m.flatMap((i) => [`${pre}${i.label || "(no label)"}${i.items ? "  ▾" : `  →  ${i.href || "(no link)"}`}`, ...(i.items ? flat(i.items, `${pre}${i.label} › `) : [])]);

export type Line = { t: "+" | "-" | " "; text: string };

// shortcut: O(n*m) LCS, fine for menus, component lists and paragraphs; swap for Myers if pages get huge.
export function seqDiff<T>(x: T[], y: T[]): { t: "+" | "-" | " "; v: T }[] {
  const L = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--)
    L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { t: "+" | "-" | " "; v: T }[] = [];
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { out.push({ t: " ", v: x[i] }); i++; j++; }
    else if (j < y.length && (i === x.length || L[i][j + 1] >= L[i + 1][j])) out.push({ t: "+", v: y[j++] });
    else out.push({ t: "-", v: x[i++] });
  }
  return out;
}

export const diffMenus = (a: MenuItem[], b: MenuItem[]): Line[] => seqDiff(flat(a), flat(b)).map((d) => ({ t: d.t, text: d.v }));
