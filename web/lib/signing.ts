import { createHmac, timingSafeEqual } from "crypto";

/** Signature of an email click link: without it /mail/click would redirect anywhere. */
export const sign = (sec: string, token: string, url: string) => createHmac("sha256", sec).update(token + "|" + url).digest("hex").slice(0, 32);

/** Constant-time string compare (for secrets and signatures). */
export const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export const clickOk = (sec: string, token: string, url: string, sig: string) => /^https?:\/\//i.test(url) && same(sig, sign(sec, token, url));
