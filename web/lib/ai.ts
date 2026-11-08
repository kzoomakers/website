import { db } from "./db";
import { tracedFetch } from "./debug";
import { getMailCfg } from "./mail";
import { open, seal } from "./vault";
import { cleanHtml } from "./sanitize";
import { BASE_PROMPT, FORMAT_RULES, SEO_PROMPT, SEO_FORMAT, parseSeo, TONES, MAX_PRICE, isCheap, promptOverride, tidyOutput } from "./ai-prompts";

// Pluggable AI for "explain this in plain words" jobs. Providers speak the OpenAI chat format; each job (scenario) is pinned to one provider + model chosen in Admin > Services > AI.
// Models are discovered from the provider's /models list, so new ones appear without a code change. Add a scenario to SCENARIOS and call complete(id, ...) to add another AI feature.
export const PROVIDERS = {
  openrouter: { name: "OpenRouter", base: "https://openrouter.ai/api/v1", keys: "https://openrouter.ai/keys" },
  deepseek: { name: "DeepSeek (direct)", base: "https://api.deepseek.com", keys: "https://platform.deepseek.com/api_keys" },
} as const;
export type ProviderId = keyof typeof PROVIDERS;
export const SCENARIOS = [
  { id: "agreement-summary", label: "Membership agreement: plain-language summary of what changed", hint: "Short text in, short text out: a cheap model is plenty." },
  { id: "blog-enhance", label: "Blog posts: Enhance with AI (rewrite in a chosen personality)", hint: "Rewrites a whole post, so choose the best of the cheap models. Style prompts are edited in section 3." },
  { id: "page-seo", label: "Page editor: Suggest description, AI summary and FAQs", hint: "Reads one page and writes short metadata: a cheap model is plenty. The prompt is edited in section 4." },
] as const;

export type Model = { id: string; name: string; price?: number; outPrice?: number }; // price: US dollars per million input tokens, when the provider says
type Cfg = { keys: Partial<Record<ProviderId, string>>; models: Partial<Record<ProviderId, { at: string; list: Model[] }>>; use: Record<string, { provider: ProviderId; model: string }>; prompts?: { base?: string; tones?: Record<string, string>; seo?: string } };

async function pool() {
  const d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  return d.pool;
}
const load = async (): Promise<Cfg> => ({ keys: {}, models: {}, use: {}, ...(await (await pool()).query("SELECT data FROM settings WHERE key = 'ai:config'")).rows[0]?.data });
const store = async (c: Cfg) => void (await (await pool()).query("INSERT INTO settings (key, data) VALUES ('ai:config', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(c)]));
const isProvider = (p: unknown): p is ProviderId => typeof p === "string" && p in PROVIDERS;

/** The token for a provider. DeepSeek falls back to the token already saved in the Postmaster settings. */
async function token(c: Cfg, p: ProviderId) {
  if (c.keys[p]) return open(Buffer.from(c.keys[p]!, "base64")).toString();
  return p === "deepseek" ? (await getMailCfg()).deepseekKey : "";
}

/** For the admin screen: whether each token is set (never the token), the discovered models, and each job's choice. */
export async function adminView() {
  const c = await load();
  return {
    providers: await Promise.all((Object.keys(PROVIDERS) as ProviderId[]).map(async (id) => ({ id, name: PROVIDERS[id].name, keysUrl: PROVIDERS[id].keys, hasKey: !!(await token(c, id)), viaMail: !c.keys[id] && !!(await token(c, id)), models: (c.models[id]?.list ?? []).filter(isCheap), at: c.models[id]?.at ?? null }))),
    scenarios: SCENARIOS.map((s) => ({ ...s, use: c.use[s.id] ?? null })),
    prompts: { base: c.prompts?.base || BASE_PROMPT, defaultBase: BASE_PROMPT, seo: c.prompts?.seo || SEO_PROMPT, defaultSeo: SEO_PROMPT, tones: TONES.map((t) => ({ id: t.id, label: t.label, text: c.prompts?.tones?.[t.id] || t.prompt, defaultText: t.prompt })) },
  };
}

/** Saves the blog style prompts. A blank or unchanged-from-default prompt is stored as "use the default". */
export async function savePrompts(base: unknown, tones: unknown, seo: unknown) {
  const c = await load(), t = (tones ?? {}) as Record<string, unknown>;
  c.prompts = { seo: promptOverride(seo, SEO_PROMPT), base: promptOverride(base, BASE_PROMPT), tones: Object.fromEntries(TONES.map((x) => [x.id, promptOverride(t[x.id], x.prompt)])) };
  await store(c);
}

export const enhanceTones = () => TONES.map(({ id, label }) => ({ id, label }));

/** Rewrites a blog post's HTML in the chosen personality, using the editable style prompts. */
export async function enhancePost(tone: unknown, html: unknown) {
  const t = TONES.find((x) => x.id === tone);
  if (!t) throw new Error("Pick a personality.");
  if (typeof html !== "string" || !html.trim()) throw new Error("Write something in the post first.");
  if (html.length > 60000) throw new Error("This post is too long to enhance in one go.");
  const c = await load();
  const system = [c.prompts?.base || BASE_PROMPT, c.prompts?.tones?.[t.id] || t.prompt, FORMAT_RULES].join("\n\n");
  return cleanHtml(tidyOutput(await complete("blog-enhance", system, html, 8000, 180000)));
}

/** Suggests a description, AI summary and FAQs from a page's text, for the editor to review. Nothing is saved here. */
export async function suggestSeo(title: unknown, text: unknown) {
  if (typeof text !== "string" || text.trim().length < 40) throw new Error("This page has too little text to summarize yet.");
  if (text.length > 30000) throw new Error("This page is too long to summarize in one go.");
  const c = await load();
  return parseSeo(await complete("page-seo", [c.prompts?.seo || SEO_PROMPT, SEO_FORMAT].join("\n\n"), `Page title: ${String(title ?? "").slice(0, 200)}\n\nPage text:\n${text}`, 1200));
}

/** "-" clears the token; anything else replaces it. */
export async function saveKey(p: unknown, key: string) {
  if (!isProvider(p)) throw new Error("Unknown service.");
  const c = await load(), k = key.trim();
  if (k === "-") { delete c.keys[p]; delete c.models[p]; } else if (k) c.keys[p] = seal(Buffer.from(k)).toString("base64");
  else throw new Error("Paste the API token first.");
  await store(c);
}

async function call(p: ProviderId, key: string, path: string, body?: unknown, ms = 60000) {
  const r = await tracedFetch(`ai-${p}`, PROVIDERS[p].base + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(ms) }, [key]).catch((e) => { throw new Error(e?.name === "TimeoutError" ? `${PROVIDERS[p].name} took longer than ${ms / 1000} seconds. Try again, a shorter post, or a faster model.` : `Couldn't reach ${PROVIDERS[p].name}: ${e.message}`); });
  if (!r.ok) throw new Error(`${PROVIDERS[p].name} said ${r.status}: ${(await r.text()).replace(/\s+/g, " ").slice(0, 200)}`);
  return r.json();
}

/** Asks the provider which models this token can use, cheapest first. */
export async function discover(p: unknown) {
  if (!isProvider(p)) throw new Error("Unknown service.");
  const c = await load(), key = await token(c, p);
  if (!key) throw new Error("Add the API token first.");
  const list: Model[] = ((await call(p, key, "/models")).data ?? []).map((m: any) => ({ id: String(m.id), name: String(m.name ?? m.id).slice(0, 120), price: m.pricing?.prompt != null && !isNaN(+m.pricing.prompt) ? +m.pricing.prompt * 1e6 : undefined, outPrice: m.pricing?.completion != null && !isNaN(+m.pricing.completion) ? +m.pricing.completion * 1e6 : undefined }));
  if (!list.length) throw new Error("That service returned no models.");
  list.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9) || a.id.localeCompare(b.id));
  c.models[p] = { at: new Date().toISOString(), list };
  await store(c);
}

export async function saveScenario(id: unknown, provider: unknown, model: unknown) {
  if (!SCENARIOS.some((s) => s.id === id) || typeof id !== "string") throw new Error("Unknown job.");
  const c = await load();
  if (provider === "" || provider == null) delete c.use[id]; // turn the feature off
  else {
    if (!isProvider(provider) || typeof model !== "string" || !model) throw new Error("Pick a service and a model.");
    if (!c.models[provider]?.list.some((m) => m.id === model && isCheap(m))) throw new Error(`Pick a model from the list. Only models at or under $${MAX_PRICE} per million tokens (or free) are allowed.`);
    c.use[id] = { provider, model };
  }
  await store(c);
}

/** True when the job has a service + model and that service has a token: the UI hides the feature otherwise. */
export async function aiReady(id: string) {
  const c = await load(), u = c.use[id];
  return !!u && !!(await token(c, u.provider));
}

/** Runs one job's chat completion with its configured model. Returns the model's text. */
export async function complete(id: string, system: string, user: string, maxTokens = 1500, timeoutMs = 60000) {
  const c = await load(), u = c.use[id];
  if (!u) throw new Error("AI isn't set up for this yet. An admin can do it under Services > AI.");
  const key = await token(c, u.provider);
  if (!key) throw new Error("The AI service has no API token.");
  if (!(await load()).models[u.provider]?.list.some((m) => m.id === u.model && isCheap(m))) throw new Error(`This model costs more than $${MAX_PRICE} per million tokens (or its price is unknown). An admin should pick another under Services > AI.`);
  const out = await call(u.provider, key, "/chat/completions", { model: u.model, max_tokens: maxTokens, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] }, timeoutMs);
  if (out.choices?.[0]?.finish_reason === "length") throw new Error("The AI ran out of room and its answer was cut off. Try a shorter post, or pick a model that allows longer answers.");
  const text = String(out.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The AI sent back nothing. Try again, or pick a different model.");
  return text;
}
