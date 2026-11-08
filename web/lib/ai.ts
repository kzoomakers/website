import { db } from "./db";
import { getMailCfg } from "./mail";
import { open, seal } from "./vault";

// Pluggable AI for "explain this in plain words" jobs. Providers speak the OpenAI chat format; each job (scenario) is pinned to one provider + model chosen in Admin > Services > AI.
// Models are discovered from the provider's /models list, so new ones appear without a code change. Add a scenario to SCENARIOS and call complete(id, ...) to add another AI feature.
export const PROVIDERS = {
  openrouter: { name: "OpenRouter", base: "https://openrouter.ai/api/v1", keys: "https://openrouter.ai/keys" },
  deepseek: { name: "DeepSeek (direct)", base: "https://api.deepseek.com", keys: "https://platform.deepseek.com/api_keys" },
} as const;
export type ProviderId = keyof typeof PROVIDERS;
export const SCENARIOS = [
  { id: "agreement-summary", label: "Membership agreement: plain-language summary of what changed", hint: "Short text in, short text out: a cheap model is plenty." },
] as const;

export type Model = { id: string; name: string; price?: number }; // price: US dollars per million input tokens, when the provider says
type Cfg = { keys: Partial<Record<ProviderId, string>>; models: Partial<Record<ProviderId, { at: string; list: Model[] }>>; use: Record<string, { provider: ProviderId; model: string }> };

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
    providers: await Promise.all((Object.keys(PROVIDERS) as ProviderId[]).map(async (id) => ({ id, name: PROVIDERS[id].name, keysUrl: PROVIDERS[id].keys, hasKey: !!(await token(c, id)), viaMail: !c.keys[id] && !!(await token(c, id)), models: c.models[id]?.list ?? [], at: c.models[id]?.at ?? null }))),
    scenarios: SCENARIOS.map((s) => ({ ...s, use: c.use[s.id] ?? null })),
  };
}

/** "-" clears the token; anything else replaces it. */
export async function saveKey(p: unknown, key: string) {
  if (!isProvider(p)) throw new Error("Unknown service.");
  const c = await load(), k = key.trim();
  if (k === "-") { delete c.keys[p]; delete c.models[p]; } else if (k) c.keys[p] = seal(Buffer.from(k)).toString("base64");
  else throw new Error("Paste the API token first.");
  await store(c);
}

async function call(p: ProviderId, key: string, path: string, body?: unknown) {
  const r = await fetch(PROVIDERS[p].base + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) }).catch((e) => { throw new Error(`Couldn't reach ${PROVIDERS[p].name}: ${e.message}`); });
  if (!r.ok) throw new Error(`${PROVIDERS[p].name} said ${r.status}: ${(await r.text()).replace(/\s+/g, " ").slice(0, 200)}`);
  return r.json();
}

/** Asks the provider which models this token can use, cheapest first. */
export async function discover(p: unknown) {
  if (!isProvider(p)) throw new Error("Unknown service.");
  const c = await load(), key = await token(c, p);
  if (!key) throw new Error("Add the API token first.");
  const list: Model[] = ((await call(p, key, "/models")).data ?? []).map((m: any) => ({ id: String(m.id), name: String(m.name ?? m.id).slice(0, 120), price: m.pricing?.prompt != null && !isNaN(+m.pricing.prompt) ? +m.pricing.prompt * 1e6 : undefined }));
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
    if (!c.models[provider]?.list.some((m) => m.id === model)) throw new Error("That model wasn't in the service's list. Use Find models, then pick one.");
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
export async function complete(id: string, system: string, user: string, maxTokens = 1500) {
  const c = await load(), u = c.use[id];
  if (!u) throw new Error("AI isn't set up for this yet. An admin can do it under Services > AI.");
  const key = await token(c, u.provider);
  if (!key) throw new Error("The AI service has no API token.");
  const out = await call(u.provider, key, "/chat/completions", { model: u.model, max_tokens: maxTokens, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const text = String(out.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The AI sent back nothing. Try again, or pick a different model.");
  return text;
}
