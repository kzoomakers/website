import { headers } from "next/headers";
import { googleAdminOk, isAdmin } from "@/auth";
import { adminTokenEmail, issueToken } from "./app-tokens";
import { googleKeys, verifyIdToken } from "./google-idtoken";

// Google admins on the phone app: the app sends Google's ID token once; we check it and hand back our own random token (stored hashed, per device) that the app sends as X-Admin-Token.

/** Trades a Google ID token (issued for our web client id) for an admin token; null if it isn't an allowed admin. */
export async function adminTokenFor(idToken: string, device: string): Promise<string | null> {
  const p = process.env.AUTH_GOOGLE_ID ? verifyIdToken(idToken, await googleKeys().catch(() => []), process.env.AUTH_GOOGLE_ID) : null;
  return p && googleAdminOk(p) ? issueToken("admin", String(p.email).toLowerCase(), device) : null;
}

/** The admin's email if the request carries a live X-Admin-Token and they are still on the allow-list; otherwise null. */
export async function mobileAdminEmail(): Promise<string | null> {
  const t = (await headers()).get("x-admin-token");
  const email = t ? await adminTokenEmail(t) : null;
  return email && isAdmin(email) ? email : null;
}
