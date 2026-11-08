#!/usr/bin/env node
// Usage: node scripts/google-env.mjs ~/Downloads/client_secret_XXXX.json [admin@email]
// Writes AUTH_GOOGLE_ID/SECRET, a generated AUTH_SECRET (kept if already set) and ADMIN_EMAILS into ./.env (git-ignored).
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import os from "os";

const [file, admin = "jonkelleynewf@gmail.com"] = process.argv.slice(2);
if (!file) { console.error("usage: node scripts/google-env.mjs <client_secret.json> [admin-email]"); process.exit(1); }

const j = JSON.parse(readFileSync(file.replace(/^~/, os.homedir()), "utf8"));
const c = j.web ?? j.installed;
if (!c?.client_id || !c?.client_secret) { console.error("not a Google OAuth client JSON"); process.exit(1); }

const want = { AUTH_GOOGLE_ID: c.client_id, AUTH_GOOGLE_SECRET: c.client_secret, ADMIN_EMAILS: admin };
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1];
want.AUTH_SECRET = get("AUTH_SECRET") || randomBytes(32).toString("base64");

let out = env;
for (const [k, v] of Object.entries(want)) {
  out = new RegExp(`^${k}=`, "m").test(out) ? out.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : out + (out && !out.endsWith("\n") ? "\n" : "") + `${k}=${v}\n`;
}
writeFileSync(".env", out, { mode: 0o600 });

const cb = "http://localhost:3000/api/auth/callback/google";
console.log(`.env updated (client ${c.client_id.slice(0, 12)}…, admin ${admin})`);
if (!(c.redirect_uris ?? []).includes(cb)) console.log(`WARNING: add ${cb} as an Authorized redirect URI in Google Cloud Console, or sign-in fails with redirect_uri_mismatch.`);
