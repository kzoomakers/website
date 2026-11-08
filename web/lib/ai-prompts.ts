// Default prompts for "Enhance with AI" on blog posts. Admins can override each one in Admin > Services > AI; blank means "use this default".
export const BASE_PROMPT = `You are an editor rewriting a blog post for a makerspace's website.
Style rules, always:
- Never use em dashes or en dashes. Use commas, periods, colons or parentheses instead.
- Use natural contractions and active voice. No corporate jargon, no marketing hype ("game-changing", "unlock the power"), no emojis, no filler openers like "In today's world".
- Preserve the author's meaning, facts, names, dates, numbers and key arguments. Never invent facts, quotes, anecdotes, statistics or personal experiences.
- Improve flow, transitions, openings and conclusions. Cut redundancy. Vary sentence length.
- Keep the post's length roughly the same.`;

export const TONES = [
  { id: "witty", label: "Witty", prompt: `Personality: witty. Playful, clever storytelling with light humor and unexpected but relevant comparisons. Humor is seasoning, not the main course: roughly one wry line per section, never a punchline on every paragraph. Warm and upbeat, never cringe or try-hard.` },
  { id: "sarcastic", label: "Sarcastic", prompt: `Personality: sarcastic. Dry, deadpan humor with understatement, irony, and gentle satire of hype, needless complexity and vendor promises. Sarcasm about 6/10: aim it at situations and technology, never at readers or people. Keep it intelligent and restrained.` },
  { id: "rigorous", label: "Technically Rigorous", prompt: `Personality: technically rigorous. Write like a seasoned engineer explaining to a peer: precise terminology, the "why" behind decisions, concrete examples and trade-offs, skepticism toward sweeping claims. Mostly substance (about 90%), with at most a touch of dry wit. Do not oversimplify or patronize. Keep any code, commands and configuration exactly as written.` },
] as const;

export const FORMAT_RULES = `Output rules: the post is HTML. Return only the rewritten post as HTML using the same kinds of tags (p, h2, h3, ul, ol, li, blockquote, pre, code, a, img, strong, em). Keep every img tag, link href, and code block unchanged. No markdown, no code fences, no explanation of your edits.`;

// Pure helpers (no database), kept here so tests can import them.
export const MAX_PRICE = 0.06; // US dollars per million tokens: only free or cheaper models can be chosen
export const MAX_PROMPT = 6000;
/** Cheap enough: input price known and within the limit; output price too when the provider lists one. */
export const isCheap = (m: { price?: number; outPrice?: number }) => m.price != null && m.price <= MAX_PRICE && (m.outPrice == null || m.outPrice <= MAX_PRICE);
/** A prompt equal to its default is stored as "" (meaning: use the default). Too long is an error, never silently cut. */
export function promptOverride(v: unknown, dflt: string) {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length > MAX_PROMPT) throw new Error(`A prompt can be at most ${MAX_PROMPT} characters. Shorten it and save again.`);
  return t === dflt ? "" : t;
}
/** Strips a ```html fence and swaps em/en dashes for commas, since models ignore the no-dash rule. */
export const tidyOutput = (s: string) => s.replace(/^```(?:html)?\s*|\s*```$/g, "").trim().replace(/(^|>)([^<]*)/g, (_, a, t) => a + t.replace(/\s*[\u2013\u2014]\s*/g, ", ")); // text only, so link addresses and tags stay intact

// "Suggest with AI" in the page editor: description, AI summary and FAQs for search engines and AI assistants.
export const SEO_PROMPT = `You write search and AI-assistant metadata for a makerspace's website page.
Rules, always:
- Use only facts stated in the page text. Never invent prices, dates, hours, names, claims or answers. If the page doesn't say it, leave it out.
- Plain, factual, natural wording. No hype, no emojis. Never use em dashes or en dashes.
- description: one sentence, at most 155 characters, saying what the page offers.
- summary: 2 to 3 factual sentences that an AI assistant could quote to answer "what is this page about?".
- faqs: up to 5 questions a visitor would really ask, each answered only from the page text. Use an empty list if the page doesn't support any.`;
export const SEO_FORMAT = `Output rules: reply with only a JSON object, no code fences and no other text: {"description": string, "summary": string, "faqs": [{"question": string, "answer": string}]}`;

const noDash = (s: string) => s.replace(/\s*[\u2013\u2014]\s*/g, ", ").trim();
/** Reads the model's JSON reply into the three editor fields. Throws a plain message when it isn't usable. */
export function parseSeo(text: string) {
  let j: any;
  try { j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); } catch { throw new Error("The AI's answer wasn't in the expected form. Try again."); }
  const str = (v: unknown, max: number) => (typeof v === "string" ? noDash(v).slice(0, max) : "");
  const faqs = (Array.isArray(j?.faqs) ? j.faqs : []).slice(0, 5).map((f: any) => ({ question: str(f?.question, 200), answer: str(f?.answer, 800) })).filter((f: any) => f.question && f.answer);
  const out = { description: str(j?.description, 160), aiSummary: str(j?.summary, 600), aiFaqs: faqs };
  if (!out.description && !out.aiSummary) throw new Error("The AI didn't suggest anything for this page. Try again.");
  return out;
}
