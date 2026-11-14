// Security response headers: the settings (edited in Admin > Security headers) and the pure function that turns them into headers for one request.
// No imports on purpose, so the tests can load it directly.

export const REFERRERS = ["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "origin-when-cross-origin", "no-referrer-when-downgrade"] as const;
export const FRAMES = ["SAMEORIGIN", "DENY", "off"] as const;
export const CSP_MODES = ["off", "report-only", "enforce"] as const;
/** The headers an exception can switch off for some paths. */
export const KEYS = ["hsts", "nosniff", "frame", "referrer", "permissions", "csp"] as const;
export type Key = (typeof KEYS)[number];

export type Exception = { path: string; skip: Key[]; note?: string };
export type SecHeaders = {
  enabled: boolean;
  hsts: { on: boolean; maxAge: number; subdomains: boolean; preload: boolean };
  nosniff: boolean;
  frame: (typeof FRAMES)[number];
  referrer: (typeof REFERRERS)[number];
  permissions: string;
  csp: { mode: (typeof CSP_MODES)[number]; directives: string };
  exceptions: Exception[];
};

export const DEFAULTS: SecHeaders = {
  enabled: true,
  hsts: { on: true, maxAge: 15552000, subdomains: false, preload: false }, // 180 days; subdomains/preload are hard to undo, so off until chosen
  nosniff: true,
  frame: "SAMEORIGIN",
  referrer: "strict-origin-when-cross-origin",
  permissions: "camera=(), microphone=(), geolocation=(), payment=()",
  // Report-only first: the browser console lists what would be blocked, nothing breaks. Switch to "enforce" once it is quiet.
  csp: {
    mode: "report-only",
    directives: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://maps.googleapis.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/", // Next and the page editor use inline scripts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://maps.googleapis.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
      "media-src 'self' https:",
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.google.com https://calendar.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("\n"),
  },
  // Static assets and the PDF viewer are the usual special cases; the /uploads proxy sets its own sandbox CSP for SVG/HTML.
  exceptions: [{ path: "/uploads/*", skip: ["csp"], note: "the proxy sets its own sandbox policy on SVG and HTML files" }],
};

/** Makes whatever was stored (older versions, hand-edited rows, bad input) into a complete, valid setting. */
export function normalize(x: any): SecHeaders {
  const d = DEFAULTS, o = x && typeof x === "object" ? x : {};
  const pick = <T extends readonly string[]>(list: T, v: unknown, fb: T[number]) => ((list as readonly string[]).includes(v as string) ? (v as T[number]) : fb);
  const str = (v: unknown, fb: string, max: number) => (typeof v === "string" ? v.replace(/[\r\0]/g, "").slice(0, max) : fb);
  const exceptions: Exception[] = Array.isArray(o.exceptions)
    ? o.exceptions.slice(0, 50).flatMap((e: any) => {
        const path = typeof e?.path === "string" ? e.path.trim().slice(0, 200) : "";
        if (!path.startsWith("/")) return [];
        return [{ path, skip: (Array.isArray(e.skip) ? e.skip : []).filter((k: unknown) => (KEYS as readonly string[]).includes(k as string)), note: str(e.note, "", 200) || undefined }];
      })
    : d.exceptions;
  return {
    enabled: o.enabled === undefined ? d.enabled : !!o.enabled,
    hsts: { on: o.hsts?.on === undefined ? d.hsts.on : !!o.hsts.on, maxAge: Math.min(63072000, Math.max(0, Math.trunc(Number(o.hsts?.maxAge ?? d.hsts.maxAge)) || 0)), subdomains: !!o.hsts?.subdomains, preload: !!o.hsts?.preload },
    nosniff: o.nosniff === undefined ? d.nosniff : !!o.nosniff,
    frame: pick(FRAMES, o.frame, d.frame),
    referrer: pick(REFERRERS, o.referrer, d.referrer),
    permissions: str(o.permissions, d.permissions, 1000).replace(/\n/g, " "),
    csp: { mode: pick(CSP_MODES, o.csp?.mode, d.csp.mode), directives: str(o.csp?.directives, d.csp.directives, 5000) },
    exceptions,
  };
}

/** "/uploads/*" matches that folder and everything below it; anything else must match the path exactly. */
export const matches = (pattern: string, path: string) =>
  pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern || path === pattern.replace(/\/$/, "");

/** CSP text from the one-directive-per-line box (blank lines and # comments ignored). */
export const cspText = (directives: string) =>
  directives.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).join("; ").replace(/[\r\n]/g, "");

/** The headers to add to the response for this request path. `https` = the visitor reached us over HTTPS (HSTS must never be sent over plain HTTP). */
export function headersFor(c: SecHeaders, path: string, https: boolean): Record<string, string> {
  if (!c.enabled) return {};
  const skip = new Set<Key>(c.exceptions.filter((e) => matches(e.path, path)).flatMap((e) => e.skip));
  const h: Record<string, string> = {};
  if (c.hsts.on && https && !skip.has("hsts")) h["strict-transport-security"] = `max-age=${c.hsts.maxAge}${c.hsts.subdomains ? "; includeSubDomains" : ""}${c.hsts.preload ? "; preload" : ""}`;
  if (c.nosniff && !skip.has("nosniff")) h["x-content-type-options"] = "nosniff";
  if (c.frame !== "off" && !skip.has("frame")) h["x-frame-options"] = c.frame;
  if (!skip.has("referrer")) h["referrer-policy"] = c.referrer;
  if (c.permissions.trim() && !skip.has("permissions")) h["permissions-policy"] = c.permissions.trim();
  const csp = cspText(c.csp.directives);
  if (c.csp.mode !== "off" && csp && !skip.has("csp")) h[c.csp.mode === "enforce" ? "content-security-policy" : "content-security-policy-report-only"] = csp;
  return h;
}
