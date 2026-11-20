import { createPublicKey, verify } from "crypto";

/** Checks a Google ID token the way Google documents it: RS256 signature against Google's published keys, then issuer, audience and expiry. Returns the claims or null. */
export function verifyIdToken(token: string, jwks: any[], aud: string, now = Date.now()): Record<string, any> | null {
  const [h, p, s] = token.split(".");
  if (!s || token.length > 4096) return null;
  try {
    const head = JSON.parse(Buffer.from(h, "base64url").toString()), jwk = jwks.find((k) => k.kid === head.kid && k.kty === "RSA");
    if (head.alg !== "RS256" || !jwk || !verify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"))) return null;
    const c = JSON.parse(Buffer.from(p, "base64url").toString());
    return c.aud === aud && ["accounts.google.com", "https://accounts.google.com"].includes(c.iss) && c.exp * 1000 > now ? c : null;
  } catch { return null; }
}

let cache: { at: number; keys: any[] } | undefined;
/** Google's signing keys, kept for an hour (they rotate about daily). */
export async function googleKeys(): Promise<any[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw new Error("Google's keys are unavailable");
  cache = { at: Date.now(), keys: (await r.json()).keys };
  return cache.keys;
}
