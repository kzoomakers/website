import { randomBytes } from "node:crypto";
import { conn } from "@/lib/db";
import { EMAIL_OK, checkPassword, hashPassword, passwordProblem, usernameProblem } from "../auth";
import { userKeyOk } from "@/lib/pushover";
import { tx } from "./submit";

// /settings (settings_controller#index and #update, user.rb). Profile and display choices for everyone; password and email only for external accounts, since admins and members sign in through the main site.

export const BOOLS = ["email_replies", "pushover_replies", "email_messages", "pushover_messages", "email_mentions", "pushover_mentions", "inbox_mentions", "show_submitted_story_threads", "show_story_previews", "show_avatars"] as const;
const DEFAULT_ON = new Set<string>(["inbox_mentions", "show_avatars"]);
export const SCHEMES = ["system", "light", "dark"], CONTRASTS = ["system", "normal", "high"];
export const ABOUT_MAX = 20_000, HOMEPAGE_MAX = 200;
const HOMEPAGE = /^(?:https?|gemini|gopher):\/\/[^/\s]+\.[^./\s]+(\/.*)?$/;

export type SettingsRow = { username: string | null; email: string; kind: "admin" | "member" | "external"; about: string; homepage: string; show_email: boolean; scheme: string; contrast: string; bools: Record<(typeof BOOLS)[number], boolean>; renamedAt: Date | null; pushoverKey: string };
export type SettingsInput = {
  username: string; email: string; homepage: string; about: string; show_email: boolean; scheme: string; contrast: string; bools: Record<(typeof BOOLS)[number], boolean>;
  pushoverKey: string; currentPassword: string; password: string; confirm: string;
};
export type Saved = { ok: true; verify?: string; newPassword?: boolean } | { ok: false; error: string };
const bad = (error: string): Saved => ({ ok: false, error });

export async function getSettings(userId: number): Promise<SettingsRow | null> {
  const c = await conn();
  const u = (await c.query("SELECT username, email, kind, about, show_email, settings FROM feed.users WHERE id = $1", [userId])).rows[0];
  if (!u) return null;
  const s = u.settings ?? {}, flag = (k: string) => (typeof s[k] === "boolean" ? s[k] : DEFAULT_ON.has(k));
  const last = (await c.query("SELECT max(created_at) AS at FROM feed.usernames WHERE user_id = $1", [userId])).rows[0].at;
  return { username: u.username, email: u.email, kind: u.kind, about: u.about ?? "", homepage: s.homepage ?? "", pushoverKey: s.pushover_user_key ?? "", show_email: u.show_email, renamedAt: last,
    scheme: SCHEMES.includes(s.prefers_color_scheme) ? s.prefers_color_scheme : "system", contrast: CONTRASTS.includes(s.prefers_contrast) ? s.prefers_contrast : "system",
    bools: Object.fromEntries(BOOLS.map((k) => [k, flag(k)])) as SettingsRow["bools"] };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** One form, validated whole before anything is written. A changed password or email needs the current password. */
export const saveSettings = (userId: number, i: SettingsInput): Promise<Saved> => tx(async (c) => {
  const u = (await c.query("SELECT id, username, email, kind, password_digest, created_at, banned_at, deleted_at FROM feed.users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
  if (!u || u.banned_at || u.deleted_at) return bad("not permitted");
  const external = u.kind === "external";
  if (!SCHEMES.includes(i.scheme) || !CONTRASTS.includes(i.contrast)) return bad("Color scheme or contrast is not one of the choices");
  const homepage = i.homepage.trim(), about = i.about.replace(/\r\n/g, "\n");
  if (homepage && (homepage.length > HOMEPAGE_MAX || !HOMEPAGE.test(homepage))) return bad("Homepage is invalid");
  if (about.length > ABOUT_MAX) return bad(`About is too long (maximum is ${ABOUT_MAX} characters)`);

  const pushoverKey = i.pushoverKey.trim();
  if (pushoverKey && !userKeyOk(pushoverKey)) return bad("Pushover user key is invalid (30 letters and numbers)");
  const username = i.username.trim(), rename = !!u.username && username !== u.username;
  if (rename) {
    const p = usernameProblem(username);
    if (p) return bad(p);
    if ((await c.query("SELECT 1 FROM feed.users WHERE lower(username) = lower($1) AND id <> $2", [username, u.id])).rowCount) return bad("Username has already been taken");
    // user.rb validate_username_timeouts: one change a year, and a name used in the last five years can't come back
    if (!(await c.query("SELECT 1 FROM feed.usernames WHERE user_id = $1 AND renamed_away_at IS NULL", [u.id])).rowCount) // an account from before the history table
      await c.query("INSERT INTO feed.usernames (username, user_id, created_at) VALUES ($1, $2, COALESCE($3, now()))", [u.username, u.id, u.created_at]);
    const recent = (await c.query("SELECT max(created_at) AS at FROM feed.usernames WHERE user_id = $1 AND created_at >= now() - interval '1 year'", [u.id])).rows[0].at;
    if (recent) return bad(`Username has already been changed in the last year (${day(recent)})`);
    const used = (await c.query("SELECT max(renamed_away_at) AS at FROM feed.usernames WHERE lower(username) = lower($1) AND renamed_away_at >= now() - interval '5 years'", [username])).rows[0].at;
    if (used) return bad(`Username has been used in the last 5 years (${day(used)})`);
  }

  let email = u.email, verify: string | undefined;
  const wantEmail = i.email.trim().toLowerCase();
  const emailChange = external && wantEmail !== "" && wantEmail !== String(u.email).toLowerCase();
  const pwChange = external && i.password !== "";
  if (emailChange || pwChange) {
    if (!u.password_digest || !(await checkPassword(i.currentPassword.slice(0, 200), u.password_digest))) return bad("Your current password was not entered correctly");
  }
  if (emailChange) {
    if (wantEmail.length > 100 || !EMAIL_OK.test(wantEmail)) return bad("Email is invalid");
    if ((await c.query("SELECT 1 FROM feed.users WHERE lower(email) = $1 AND id <> $2", [wantEmail, u.id])).rowCount) return bad("That email address can't be used");
    email = wantEmail; verify = wantEmail;
  }
  let digest: string | undefined;
  if (pwChange) {
    if (i.password !== i.confirm) return bad("Password confirmation doesn't match");
    const p = passwordProblem(i.password, email);
    if (p) return bad(p);
    digest = await hashPassword(i.password);
  }

  if (rename) {
    await c.query("UPDATE feed.usernames SET renamed_away_at = now() WHERE user_id = $1 AND renamed_away_at IS NULL", [u.id]);
    await c.query("INSERT INTO feed.usernames (username, user_id) VALUES ($1, $2)", [username, u.id]);
    await c.query("INSERT INTO feed.moderations (moderator_user_id, user_id, is_from_suggestions, action, token) VALUES (NULL, $1, true, $2, $3)", [u.id, `changed own username from "${u.username}" to "${username}"`, `moderation_${randomBytes(16).toString("hex")}`]);
  }
  const prefs = { prefers_color_scheme: i.scheme, prefers_contrast: i.contrast, homepage, pushover_user_key: pushoverKey, ...i.bools };
  await c.query(
    `UPDATE feed.users SET username = $2, email = $3, about = $4, show_email = $5, settings = COALESCE(settings, '{}'::jsonb) || $6::jsonb,
       email_verified_at = CASE WHEN $7::boolean THEN NULL ELSE email_verified_at END,
       password_digest = COALESCE($8, password_digest), session_version = session_version + CASE WHEN $8::text IS NULL THEN 0 ELSE 1 END WHERE id = $1`,
    [u.id, rename ? username : u.username, email, about || null, i.show_email, JSON.stringify(prefs), !!verify, digest ?? null]);
  return { ok: true, verify, newPassword: !!digest };
});
