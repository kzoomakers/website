// Search/AI-assistant optimization data derived from a page: plain text, summary, JSON-LD, llms.txt.
// No imports from the store, so it stays pure and testable.
const SKIP_KEY = /^(id|href|src|image|bgImage|className|css|code|type|tag|parent|bodyClass|refresh)$/;
const ADDRESS = /^(https?:\/\/|\/|#|mailto:|tel:)\S*$/; // a whole value that is only a link, not a sentence that happens to start with "#"

/** All human-readable strings in a Puck page's content, in order. */
export function pageText(data: any): string {
  const out: string[] = [];
  const walk = (v: any, k = "") => {
    if (typeof v === "string") { if (!SKIP_KEY.test(k) && !ADDRESS.test(v.trim())) out.push(v.replace(/<[^>]*>/g, " ")); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
    else if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, kk);
  };
  walk(data?.content);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

const rp = (data: any) => data?.root?.props ?? {};

/** The editor's AI summary, else the page description, else the start of its text (cut at a word). */
export function summaryOf(data: any, max = 200): string {
  const d = String(rp(data).aiSummary || rp(data).description || "").trim();
  if (d) return d;
  const t = pageText(data);
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

/** The editor's canonical override, else the page's own address. */
export function canonicalOf(slug: string, data: any, site: string): string {
  const c = String(rp(data).canonical || "").trim();
  return /^https?:\/\/[^\s<>"]+$/.test(c) ? c : slug === "index" ? site + "/" : `${site}/${slug}`; // a malformed override would drop the page from search, so it is ignored
}

/** Image addresses must be absolute in structured data and share tags. */
export const absUrl = (site: string, u: string) => (u.startsWith("/") ? site + u : u);

/** Runs f at most once per `ms`; concurrent callers share the same run. A failure is not remembered. */
export function ttl<T>(ms: number, f: () => Promise<T>): () => Promise<T> {
  let at = 0, v: Promise<T> | undefined;
  return () => (v && Date.now() - at < ms ? v : ((at = Date.now()), (v = f().catch((e) => { v = undefined; throw e; }))));
}

/** Whether the page belongs in llms.txt: not hidden from AI and not noindex. */
export const listed = (data: any): boolean => !rp(data).aiExclude && !rp(data).noindex;

type Contact = { address: string; phone: string; email: string };
const SITE_NAME = "Kzoo Makers";

/** Structured data for a page. Auto = the business on the home page, a breadcrumb trail elsewhere; the editor can force a type or turn it off. FAQPage is added whenever the page has FAQs. */
export function jsonLd(slug: string, data: any, contact: Contact, site: string): object[] {
  const r = rp(data), type = r.schemaType || "auto";
  if (type === "none") return [];
  const url = canonicalOf(slug, data, site), title = String(r.title ?? SITE_NAME), description = summaryOf(data), ctx = { "@context": "https://schema.org" };
  const out: object[] = [{ ...ctx, "@type": "WebPage", name: title, description, url }];
  if (slug === "index") out.push({ ...ctx, "@type": "WebSite", name: SITE_NAME, url: site });
  if (["Article", "Course", "Event"].includes(type)) out.push({ ...ctx, "@type": type, name: title, description, url });
  if (slug !== "index") out.push({ ...ctx, "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: site + "/" }, { "@type": "ListItem", position: 2, name: title, item: url }] });
  const faqs = (Array.isArray(r.aiFaqs) ? r.aiFaqs : []).filter((f: any) => f?.question?.trim() && f?.answer?.trim());
  if (faqs.length) out.push({ ...ctx, "@type": "FAQPage", mainEntity: faqs.map((f: any) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) });
  if (slug === "index" || type === "LocalBusiness") out.push({ ...ctx, "@type": "LocalBusiness", name: SITE_NAME, url: site, telephone: contact.phone, email: contact.email, address: contact.address });
  return out;
}

/** Structured data for a blog post. */
export function articleLd(p: { title: string; excerpt: string; image: string; date: string; modified: string; author: string | null; url: string }, site: string): object[] {
  return [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.excerpt, url: p.url, datePublished: p.date, dateModified: p.modified, ...(p.image && { image: absUrl(site, p.image) }),
    ...(p.author && { author: { "@type": "Person", name: p.author } }), publisher: { "@type": "Organization", name: SITE_NAME, url: site } }];
}

/** Safe to put inside a <script> tag. */
export const ldScript = (o: object[]) => JSON.stringify(o).replace(/</g, "\\u003c");

/** llms.txt: a short markdown index of the site for AI assistants. */
export function llmsTxt(intro: string, pages: { url: string; title: string; summary: string }[]): string {
  return `# ${SITE_NAME}\n\n> ${intro}\n\n## Pages\n\n${pages.map((p) => `- [${p.title}](${p.url})${p.summary ? ": " + p.summary.replace(/\s+/g, " ") : ""}`).join("\n")}\n`;
}

/** robots.txt lines that keep AI crawlers out of the pages the editor hid from AI. */
export const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Google-Extended", "CCBot"];
export const aiRobots = (slugs: string[]): string => !slugs.length ? "" : AI_BOTS.map((b) => `User-agent: ${b}\n${slugs.map((x) => `Disallow: /${x === "index" ? "" : x}$`).join("\n")}\n`).join("\n");
