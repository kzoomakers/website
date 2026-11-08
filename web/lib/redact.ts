// Scrubs credentials out of anything the debug log records. No imports, so the tests can load it directly.
export const MASK = "•".repeat(10);
const MAX = 50_000; // longest string kept whole; a runaway body can't fill the debug table

// Names that hold a credential: "authorization", "x-api-key", "access_token", "client_secret", "password", "set-cookie"…
// "max_tokens" / "total_tokens" are counts, not credentials, so they stay (the name must END in the word).
const SECRET_NAME = /(^|[_\-.])(api[_\-]?key|key|secret|password|passwd|pwd|authorization|token|credentials?|cookie|set-cookie|signature|sig)$/i;
export const secretName = (k: string) => SECRET_NAME.test(k.replace(/([a-z])([A-Z])/g, "$1_$2"));

/** Credentials that show up inside text: "Bearer abc…", "sk-…" style keys, and ?key=… style URL parameters. Known secrets are also removed wherever they appear verbatim. */
export function scrubText(s: string, secrets: readonly string[] = []): string {
  let t = s;
  for (const k of secrets) if (k.length >= 6) t = t.split(k).join(MASK);
  t = t.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+\/=\-]{6,}/gi, `$1 ${MASK}`)
    .replace(/\/private-[A-Za-z0-9]{8,}/g, `/private-${MASK}`) // Google's secret calendar links
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}/g, MASK)
    .replace(/([?&;](?:api[_-]?key|key|token|access_token|secret|password|sig|signature)=)[^&\s"']+/gi, `$1${MASK}`);
  return t.length > MAX ? t.slice(0, MAX) + `… (${t.length - MAX} more characters)` : t;
}

/** A copy of `v` with every credential-named field masked and every string scrubbed. */
export function redact(v: unknown, secrets: readonly string[] = [], depth = 0): unknown {
  if (typeof v === "string") return scrubText(v, secrets);
  if (!v || typeof v !== "object" || depth > 12) return v;
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => redact(x, secrets, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, secretName(k) && x != null && x !== "" ? MASK : redact(x, secrets, depth + 1)]));
}

/** Headers as a plain object. A credential keeps its scheme ("Bearer ••••••••••") so you can see what kind was sent. */
export function redactHeaders(h: Headers | Record<string, string> | undefined, secrets: readonly string[] = []) {
  const out: Record<string, string> = {};
  const add = (v: string, k: string) => {
    const scheme = /^(Bearer|Basic|Token)\s/i.exec(v)?.[1];
    out[k.toLowerCase()] = secretName(k) ? (scheme ? `${scheme} ${MASK}` : MASK) : scrubText(v, secrets);
  };
  if (h instanceof Headers) h.forEach(add); else for (const [k, v] of Object.entries(h ?? {})) add(v, k);
  return out;
}

/** A request or response body (text) for the log: parsed and scrubbed if it is JSON, otherwise scrubbed text. */
export function redactBody(text: string | null | undefined, secrets: readonly string[] = []): unknown {
  if (!text) return text ?? null;
  try { return redact(JSON.parse(text), secrets); } catch { return scrubText(text, secrets); }
}
