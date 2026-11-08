// Finds where fields belong on an uploaded PDF, from what pdf.js reads off each page. Pure functions (no pdf.js import) so they're testable.
// Looks for, in order of trust: real PDF form fields, Documenso-style {{signature, r1}} placeholders, blank lines ("Name: ______") and caption labels ("Signature of Member", "Date", "Place your initials here").
// All coordinates in: PDF points, origin bottom-left. All coordinates out: percent of the page, origin top-left (what the editor stores).
export type Item = { str: string; x: number; y: number; w: number; h: number }; // y = baseline
export type Annot = { kind: "text" | "checkbox" | "dropdown" | "signature"; name: string; options: string[]; rect: [number, number, number, number] };
export type PageData = { w: number; h: number; items: Item[]; annots: Annot[] };
export type Found = { r: number; type: string; page: number; x: number; y: number; w: number; h: number; label: string; options: string[]; required: boolean };

const TYPES = ["signature", "initials", "date", "name", "email", "text", "checkbox", "dropdown"];
const SIZE: Record<string, [number, number]> = { signature: [180, 30], initials: [70, 18], date: [90, 16], name: [180, 16], email: [180, 16], text: [180, 16], checkbox: [14, 14], dropdown: [140, 16] };
// Caption/label wording -> field type. Short strings only, so body paragraphs that mention "signature" don't match.
const LABELS: [string, RegExp, number][] = [
  ["initials", /\binitials?\b/i, 40],
  ["signature", /^\s*(\S+\s+)?(signature|sign here|signed by)/i, 50], // keyword must open the line: "provide their signature:" in a sentence is not a label
  ["date", /^\s*(date|dated|date signed|today'?s date)\b/i, 24],
  ["email", /e-?mail/i, 30],
  ["name", /^\s*(printed |print |full |legal )?name\b|^\s*name of\b|^\s*printed name/i, 50],
];
const labelType = (s: string) => LABELS.find(([, re, max]) => s.trim().length <= max && re.test(s))?.[0];
const fromName = (n: string, fallback: string) => (/initial/i.test(n) ? "initials" : /sign/i.test(n) ? "signature" : /date/i.test(n) ? "date" : /e-?mail/i.test(n) ? "email" : /^(full|printed|print|legal)?[ _-]?name$/i.test(n) ? "name" : fallback);

export function detect(pages: PageData[], recipient = 0, maxRecipient = 0): Found[] {
  const out: Found[] = [];
  pages.forEach((pg, pi) => {
    const mine: { x: number; y: number; w: number; h: number }[] = []; // bottom-left points, for overlap checks
    const add = (type: string, x: number, y: number, w: number, h: number, r = recipient, label = "", options: string[] = []) => {
      w = Math.max(8, Math.min(w, pg.w)); h = Math.max(8, Math.min(h, pg.h)); x = Math.max(0, Math.min(pg.w - w, x)); y = Math.max(0, Math.min(pg.h - h, y));
      if (mine.some((m) => Math.min(m.x + m.w, x + w) - Math.max(m.x, x) > 0.3 * Math.min(w, m.w) && Math.min(m.y + m.h, y + h) - Math.max(m.y, y) > 0.3 * Math.min(h, m.h))) return;
      mine.push({ x, y, w, h });
      out.push({ r: Math.min(r, maxRecipient), type, page: pi + 1, x: x / pg.w * 100, y: (pg.h - y - h) / pg.h * 100, w: w / pg.w * 100, h: h / pg.h * 100, label, options, required: true });
    };
    // 1. real form fields
    for (const a of pg.annots) {
      const [x1, y1, x2, y2] = a.rect, base = a.kind === "text" ? "text" : a.kind;
      add(fromName(a.name, base), Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), recipient, a.kind === "text" || a.kind === "dropdown" ? a.name.replace(/[_-]+/g, " ").slice(0, 60) : "", a.options.slice(0, 20));
    }
    // 2. {{type, r1}} placeholders
    const used = new Set<Item>();
    for (const it of pg.items) {
      const m = /\{\{\s*([a-z]+)\s*(?:,\s*r(\d+))?[^}]*\}\}/i.exec(it.str);
      if (!m || !TYPES.includes(m[1].toLowerCase())) continue;
      used.add(it);
      const t = m[1].toLowerCase(), [dw, dh] = SIZE[t];
      add(t, it.x, it.y - 3, Math.max(it.w, dw), Math.max(it.h + 4, dh), m[2] ? Math.max(0, Number(m[2]) - 1) : recipient);
    }
    // 3. blank lines: "Name: ______" (label to the left on the same line, or just underneath)
    const isBlank = (s: string) => /_{4,}|\.{8,}|-{8,}/.test(s);
    for (const it of pg.items) {
      if (used.has(it) || !isBlank(it.str)) continue;
      const left = pg.items.filter((o) => o !== it && !isBlank(o.str) && Math.abs(o.y - it.y) < 3 && o.x + o.w <= it.x + 2 && labelType(o.str)).sort((a, b) => b.x - a.x)[0];
      const below = pg.items.filter((o) => o !== it && !isBlank(o.str) && o.y < it.y && it.y - o.y < 18 && o.x < it.x + it.w && o.x + o.w > it.x && labelType(o.str)).sort((a, b) => b.y - a.y)[0];
      const lab = left ?? below, t = lab && labelType(lab.str);
      if (!t) continue;
      used.add(lab); used.add(it);
      add(t, it.x, it.y - 2, it.w, SIZE[t][1]);
    }
    // 4. checkbox glyphs
    for (const it of pg.items) if (!used.has(it) && /^[☐□▢❑]$|^\[\s\]$/.test(it.str.trim())) { used.add(it); add("checkbox", it.x, it.y - 2, Math.max(it.w, 12), Math.max(it.h, 12)); }
    // 5. caption labels with the line drawn as vector art: field above "Signature of Member", or beside "Date:" / "...initials here"
    for (const it of pg.items) {
      const t = used.has(it) ? undefined : labelType(it.str);
      if (!t) continue;
      const [w, h] = SIZE[t], beside = /[:：]\s*$/.test(it.str) || (t === "initials" && /here\s*$/i.test(it.str)) || (t === "signature" && /sign here/i.test(it.str));
      used.add(it);
      if (beside) add(t, it.x + it.w + 6, it.y - 3, w, h);
      else add(t, it.x, it.y + it.h + 1, Math.max(w, Math.min(it.w, 260)), h);
    }
  });
  return out;
}
