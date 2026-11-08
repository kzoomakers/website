// Pure email rendering (no node APIs) so the editor canvas, the preview and the sender use the exact same HTML.
export type Leaf =
  | { t: "heading"; text: string; align: string }
  | { t: "text"; html: string; align: string }
  | { t: "image"; src: string; alt: string; href: string }
  | { t: "button"; label: string; href: string; color: string }
  | { t: "divider" }
  | { t: "spacer"; h: number }
  | { t: "social"; links: { label: string; href: string }[] }
  | { t: "footer"; text: string };
export type Block = Leaf | { t: "columns"; cols: Leaf[][] };
export type Design = { bg: string; contentBg: string; accent: string; text: string; heading: string; font: string; size: number; blocks: Block[] };

export const FONTS: Record<string, string> = {
  Arial: "Arial,Helvetica,sans-serif", Verdana: "Verdana,Geneva,sans-serif", Tahoma: "Tahoma,Geneva,sans-serif", "Trebuchet MS": "'Trebuchet MS',sans-serif",
  Georgia: "Georgia,serif", "Times New Roman": "'Times New Roman',Times,serif", "Courier New": "'Courier New',monospace",
};
export const DEFAULT_STYLE = { bg: "#f2f2f2", contentBg: "#ffffff", accent: "#2f6fed", text: "#333333", heading: "#1c2024", font: "Arial", size: 16 };
export const LEAF_TYPES: Leaf["t"][] = ["heading", "text", "image", "button", "divider", "spacer", "social", "footer"];

export const blank = (t: Block["t"], n = 2): Block => {
  switch (t) {
    case "heading": return { t, text: "Headline", align: "left" };
    case "text": return { t, html: "<p>Write something…</p>", align: "left" };
    case "image": return { t, src: "", alt: "", href: "" };
    case "button": return { t, label: "Learn more", href: "https://", color: "" };
    case "divider": return { t };
    case "spacer": return { t, h: 24 };
    case "social": return { t, links: [{ label: "Facebook", href: "https://" }] };
    case "footer": return { t, text: "You are receiving this because you subscribed to updates." };
    case "columns": return { t, cols: Array.from({ length: n }, () => []) };
  }
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const color = (c: unknown, d: string) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? String(c) : d);
const align = (a: unknown) => (a === "center" || a === "right" ? String(a) : "left");

/** Only http(s)/mailto/{{unsubscribe}} links survive; AI or pasted content can't smuggle javascript: URLs. Site-relative paths get the site origin. */
export function safeUrl(u: unknown, base: string): string {
  const s = String(u ?? "").trim();
  if (s === "{{unsubscribe}}") return s;
  if (s.startsWith("/") && !s.startsWith("//")) return base + s;
  return /^(https?:\/\/|mailto:)/i.test(s) ? s : "#";
}

/** Allow-list HTML sanitiser for rich text: tokenises, keeps a few tags with rebuilt attributes, drops everything else, escapes stray "<". */
export function cleanHtml(html: string): string {
  return (String(html ?? "").match(/<[^>]*>|[^<]+|</g) ?? []).map((tok) => {
    if (tok === "<") return "&lt;";
    if (tok[0] !== "<") return tok;
    const m = tok.match(/^<(\/?)([a-z0-9]+)([^>]*)>$/i);
    if (!m) return "";
    const [, close, tag0, attrs] = m, tag = tag0.toLowerCase();
    const t = tag === "div" || tag === "b" ? (tag === "b" ? "strong" : "p") : tag === "i" ? "em" : tag;
    if (!["p", "br", "strong", "em", "u", "a", "ul", "ol", "li", "h2", "h3"].includes(t)) return "";
    if (close) return t === "br" ? "" : `</${t}>`;
    if (t === "a") {
      const h = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      return `<a href="${esc((h?.[1] ?? h?.[2] ?? "").replace(/&amp;/g, "&"))}">`;
    }
    return t === "br" ? "<br>" : t === "p" ? '<p style="margin:0 0 14px">' : `<${t}>`;
  }).join("");
}
const para = (t: string) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

/** Link hrefs inside rich text get their final (absolute, safe) value and colour at render time. */
const linkify = (html: string, d: Design, base: string) =>
  html.replace(/<a href="([^"]*)">/g, (_, h) => `<a href="${esc(safeUrl(h.replace(/&amp;/g, "&"), base))}" style="color:${d.accent}">`);

export function renderBlock(b: Block, d: Design, base: string): string {
  const font = FONTS[d.font] ?? FONTS.Arial;
  switch (b.t) {
    case "heading": return `<h1 style="margin:0 0 14px;font:700 ${Math.round(d.size * 1.6)}px/1.25 ${font};color:${d.heading};text-align:${align(b.align)}">${esc(b.text)}</h1>`;
    case "text": return `<div style="font:${d.size}px/1.6 ${font};color:${d.text};text-align:${align(b.align)}">${linkify(b.html, d, base)}</div>`;
    case "image": {
      if (!b.src) return "";
      const img = `<img src="${esc(safeUrl(b.src, base))}" alt="${esc(b.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border:0">`;
      return b.href ? `<a href="${esc(safeUrl(b.href, base))}">${img}</a>` : img;
    }
    case "button": return `<table role="presentation" align="center" style="margin:8px auto 14px"><tr><td style="background:${color(b.color, d.accent)};border-radius:6px"><a href="${esc(safeUrl(b.href, base))}" style="display:inline-block;padding:12px 26px;font:700 ${d.size}px ${font};color:#fff;text-decoration:none">${esc(b.label)}</a></td></tr></table>`;
    case "divider": return `<hr style="border:0;border-top:1px solid #ddd;margin:18px 0">`;
    case "spacer": return `<div style="height:${b.h}px;line-height:1px">&nbsp;</div>`;
    case "social": return `<p style="text-align:center;font:14px ${font};margin:8px 0">${b.links.map((l) => `<a href="${esc(safeUrl(l.href, base))}" style="color:${d.accent};margin:0 8px">${esc(l.label)}</a>`).join("")}</p>`;
    case "footer": return `<div style="font:12px/1.5 ${font};color:#888;text-align:center;margin-top:18px">${esc(b.text)}<br><a href="{{unsubscribe}}" style="color:#888">Unsubscribe</a> · <a href="{{preferences}}" style="color:#888">Manage preferences</a></div>`;
    case "columns": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${b.cols.map((c) => `<td class="col" valign="top" width="${Math.floor(100 / b.cols.length)}%" style="padding:0 8px">${c.map((x) => renderBlock(x, d, base)).join("")}</td>`).join("")}</tr></table>`;
  }
}

/** Merge tags are filled per recipient at send time; the preview uses sample values. */
export function renderEmail(d: Design, base: string, preview = ""): string {
  const body = d.blocks.map((b) => renderBlock(b, d, base)).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>@media(max-width:480px){.col{display:block!important;width:100%!important;padding:0!important}}</style></head><body style="margin:0;padding:0;background:${d.bg}">`
    + (preview ? `<div style="display:none;max-height:0;overflow:hidden">${esc(preview)}</div>` : "")
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${d.contentBg}"><tr><td style="padding:24px">${body}</td></tr></table></td></tr></table></body></html>`;
}

/** Fills {{name}} / {{unsubscribe}} for one recipient. */
export const fill = (html: string, v: { name: string; unsubscribe: string; preferences?: string }) =>
  html.replace(/\{\{unsubscribe\}\}/g, esc(v.unsubscribe)).replace(/\{\{preferences\}\}/g, esc(v.preferences ?? v.unsubscribe)).replace(/\{\{name\}\}/g, esc(v.name || "friend"));

const str = (x: unknown) => String(x ?? "");
function cleanLeaf(b: any): Leaf | null {
  switch (b?.t) {
    case "heading": return { t: "heading", text: str(b.text), align: align(b.align) };
    case "text": return { t: "text", html: cleanHtml(b.html ?? para(str(b.text))), align: align(b.align) };
    case "image": return { t: "image", src: str(b.src), alt: str(b.alt), href: str(b.href) };
    case "button": return { t: "button", label: str(b.label), href: str(b.href), color: color(b.color, "") };
    case "divider": return { t: "divider" };
    case "spacer": return { t: "spacer", h: Math.min(120, Math.max(4, Number(b.h) || 24)) };
    case "social": return { t: "social", links: (Array.isArray(b.links) ? b.links : []).slice(0, 8).map((l: any) => ({ label: str(l?.label), href: str(l?.href) })) };
    case "footer": return { t: "footer", text: str(b.text) };
  }
  return null;
}

/** Coerces untrusted JSON (AI output, API bodies) into a valid Design; unknown blocks are dropped. */
export function cleanDesign(x: any): Design {
  const blocks = (Array.isArray(x?.blocks) ? x.blocks : []).slice(0, 60).map((b: any): Block | null =>
    b?.t === "columns" ? { t: "columns", cols: (Array.isArray(b.cols) ? b.cols : []).slice(0, 3).map((c: any) => (Array.isArray(c) ? c : []).slice(0, 20).map(cleanLeaf).filter(Boolean) as Leaf[]) } : cleanLeaf(b))
    .filter(Boolean) as Block[];
  const D = DEFAULT_STYLE;
  return { bg: color(x?.bg, D.bg), contentBg: color(x?.contentBg, D.contentBg), accent: color(x?.accent, D.accent), text: color(x?.text, D.text), heading: color(x?.heading, D.heading),
    font: x?.font in FONTS ? x.font : D.font, size: Math.min(22, Math.max(12, Number(x?.size) || D.size)), blocks };
}

const P = (...ps: string[]) => ps.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join("");
const FOOT: Leaf = { t: "footer", text: "You are receiving this because you subscribed to updates." };
export const TEMPLATES: { name: string; design: Design }[] = [
  { name: "Blank", design: { ...DEFAULT_STYLE, blocks: [{ t: "text", html: P("Write something…"), align: "left" }, FOOT] } },
  { name: "Newsletter", design: { ...DEFAULT_STYLE, blocks: [{ t: "image", src: "", alt: "Banner", href: "" }, { t: "heading", text: "This month at the makerspace", align: "left" }, { t: "text", html: P("Hi {{name}},", "Here's what's happening this month."), align: "left" }, { t: "divider" },
    { t: "columns", cols: [[{ t: "heading", text: "Events", align: "left" }, { t: "text", html: P("Tell people what's coming up."), align: "left" }], [{ t: "heading", text: "News", align: "left" }, { t: "text", html: P("Share an update."), align: "left" }]] },
    { t: "button", label: "See the calendar", href: "/calendar", color: "" }, { t: "social", links: [{ label: "Facebook", href: "https://" }, { label: "Instagram", href: "https://" }] }, FOOT] } },
  { name: "Announcement", design: { ...DEFAULT_STYLE, bg: "#fff7ec", accent: "#e8590c", blocks: [{ t: "heading", text: "Big news!", align: "center" }, { t: "text", html: P("Tell people what's new."), align: "center" }, { t: "button", label: "Find out more", href: "https://", color: "" }, FOOT] } },
  { name: "Event invite", design: { ...DEFAULT_STYLE, bg: "#eef6ff", accent: "#1c7ed6", blocks: [{ t: "heading", text: "You're invited", align: "left" }, { t: "text", html: P("<strong>Date:</strong> ", "<strong>Time:</strong> ", "<strong>Where:</strong> "), align: "left" }, { t: "button", label: "RSVP", href: "https://", color: "" }, { t: "spacer", h: 16 }, FOOT] } },
];
