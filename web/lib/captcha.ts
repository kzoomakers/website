import { db } from "./db";
import { clientIp } from "./comments";

// Google reCAPTCHA v2 ("I'm not a robot"), keys set under Admin > Setup (settings table, key "captcha"). The site key is public (the browser needs it); the secret never leaves the server.
// With no keys saved the widget doesn't show and checks are skipped, so the public forms keep working until an admin turns it on.
export type CaptchaCfg = { site: string; secret: string };
let cached: { at: number; cfg: CaptchaCfg | null } | null = null;

export async function captchaCfg(): Promise<CaptchaCfg | null> {
  if (cached && Date.now() - cached.at < 30_000) return cached.cfg;
  const d = db();
  if (!d) return null;
  try {
    await d.ready;
    const v = (await d.pool.query("SELECT data FROM settings WHERE key = 'captcha'")).rows[0]?.data;
    const cfg = v?.site && v?.secret ? { site: String(v.site), secret: String(v.secret) } : null;
    cached = { at: Date.now(), cfg };
    return cfg;
  } catch { return null; }
}

const KEY = /^[A-Za-z0-9_-]{20,80}$/;
/** Blank site key turns it off. A blank secret keeps the one already saved (the secret is never sent back to the browser). */
export async function setCaptcha(rawSite: unknown, rawSecret: unknown) {
  const site = String(rawSite ?? "").trim(), d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  let secret = String(rawSecret ?? "").trim();
  if (site && !KEY.test(site)) throw new Error("That doesn't look like a reCAPTCHA site key.");
  if (secret && !KEY.test(secret)) throw new Error("That doesn't look like a reCAPTCHA secret key.");
  if (site && !secret) secret = String((await d.pool.query("SELECT data FROM settings WHERE key = 'captcha'")).rows[0]?.data?.secret ?? "");
  if (site && !secret) throw new Error("Enter the secret key too.");
  await d.pool.query("INSERT INTO settings (key, data) VALUES ('captcha', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(site ? { site, secret } : {})]);
  cached = null;
}

const NEED = "Please tick “I'm not a robot” first.";
/** Throws a visitor-friendly message unless Google confirms the widget's token. Does nothing while the feature is off. */
export async function verifyCaptcha(req: Request, token: unknown) {
  const c = await captchaCfg();
  if (!c) return;
  const t = typeof token === "string" ? token : "";
  if (!t || t.length > 4096) throw new Error(NEED);
  let ok = false;
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", { method: "POST", body: new URLSearchParams({ secret: c.secret, response: t, remoteip: clientIp(req) }), signal: AbortSignal.timeout(8000) });
    ok = !!(await r.json()).success;
  } catch { throw new Error("Couldn't check the “I'm not a robot” box right now. Please try again."); } // fail closed: a bot can't make Google unreachable
  if (!ok) throw new Error("The “I'm not a robot” check expired or failed. Please tick it again.");
}
