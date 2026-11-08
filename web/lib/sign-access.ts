import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Signer access checks (password hashing and the short-lived "passed the check" cookie). Kept free of database imports so it can be tested alone.
export const hashPw = (pw: string) => { const salt = randomBytes(16); return salt.toString("hex") + ":" + scryptSync(pw, salt, 32).toString("hex"); };
export const checkPw = (pw: string, h: string) => { const [salt, want] = h.split(":"); return !!want && timingSafeEqual(scryptSync(pw, Buffer.from(salt, "hex"), 32), Buffer.from(want, "hex")); };
const hmac = (m: string) => createHmac("sha256", process.env.PII_CRYPTO_SECRET ?? "").update("sign-unlock:" + m).digest("hex");
export const unlockCookie = (signerId: number) => { const exp = Date.now() + 2 * 3600_000; return { name: "su" + signerId, value: `${exp}.${hmac(signerId + "." + exp)}`, maxAge: 7200 }; };
/** Does this cookie value prove the signer already passed their password / code check? */
export const unlocked = (signerId: number, value?: string) => { const [exp, mac] = (value ?? "").split("."); return !!mac && +exp > Date.now() && mac.length === 64 && timingSafeEqual(Buffer.from(mac), Buffer.from(hmac(signerId + "." + exp))); };

export const cookieOf = (req: Request, name: string) => req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(name + "="))?.slice(name.length + 1);

