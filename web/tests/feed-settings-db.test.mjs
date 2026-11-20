// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

async function setup() {
  const { conn } = await import("../lib/db.ts"), { hashPassword } = await import("../feed/auth.ts"), S = await import("../feed/models/settings.ts");
  const c = await conn(), n = Date.now().toString(36).slice(-8);
  const mk = async (name, kind) => (await c.query(`INSERT INTO feed.users (username, email, token, kind, password_digest, created_at) VALUES ($1, $2, $3, $4, $5, now() - interval '3 years') RETURNING id`,
    [name + n, `${name}${n}@example.org`, `u${name}${n}`, kind, kind === "external" ? await hashPassword("old password 123") : null])).rows[0];
  const form = (o = {}) => ({ username: "", email: "", homepage: "", pushoverKey: "", about: "", show_email: false, scheme: "system", contrast: "system", bools: Object.fromEntries(S.BOOLS.map((k) => [k, false])), currentPassword: "", password: "", confirm: "", ...o });
  return { c, n, mk, form, S };
}

test("settings: profile and prefs save, bad input is refused whole", { skip }, async () => {
  const { c, mk, form, S } = await setup(), u = await mk("pf", "external");
  const cur = (await S.getSettings(u.id));
  assert.deepEqual([cur.scheme, cur.bools.inbox_mentions, cur.bools.show_avatars, cur.bools.email_replies], ["system", true, true, false], "defaults");
  const f = (o) => S.saveSettings(u.id, form({ username: cur.username, email: cur.email, ...o }));
  for (const [o, why] of [[{ scheme: "neon" }, /Color scheme/], [{ contrast: "x" }, /Color scheme/], [{ homepage: "javascript:alert(1)" }, /Homepage/], [{ about: "a".repeat(20_001) }, /About/]]) assert.match((await f(o)).error, why);
  const bools = Object.fromEntries(S.BOOLS.map((k) => [k, k === "email_replies" || k === "show_avatars"]));
  assert.ok((await f({ about: "Hi *there*", homepage: "https://example.org/me", show_email: true, scheme: "dark", contrast: "high", bools })).ok);
  const s = await S.getSettings(u.id);
  assert.deepEqual([s.about, s.homepage, s.show_email, s.scheme, s.contrast, s.bools.email_replies, s.bools.inbox_mentions, s.bools.show_avatars], ["Hi *there*", "https://example.org/me", true, "dark", "high", true, false, true]);
});

test("settings: username changes follow Lobsters' timeouts and are logged", { skip }, async () => {
  const { c, n, mk, form, S } = await setup(), u = await mk("rn", "external"), name = "rn" + n;
  const email = `rn${n}@example.org`, f = (username) => S.saveSettings(u.id, form({ username, email }));
  assert.match((await f("bad name!")).error, /Usernames/);
  assert.match((await f("admin")).error, /reserved/);
  assert.match((await f("system")).error, /reserved/);
  const other = await mk("ot", "member"); const taken = (await c.query("SELECT username FROM feed.users WHERE id = $1", [other.id])).rows[0].username;
  assert.match((await f(taken.toUpperCase())).error, /taken/);
  assert.ok((await f(name + "x")).ok, "an account from before the history table gets its row, dated from sign-up, so it may rename");
  assert.match((await f(name + "y")).error, /changed in the last year/);
  await c.query("UPDATE feed.usernames SET created_at = now() - interval '2 years', renamed_away_at = CASE WHEN renamed_away_at IS NULL THEN NULL ELSE now() - interval '2 years' END WHERE user_id = $1", [u.id]);
  assert.match((await f(name)).error, /used in the last 5 years/, "can't go back to the old name");
  assert.ok((await f(name + "z")).ok);
  const log = await c.query("SELECT action, is_from_suggestions, moderator_user_id FROM feed.moderations WHERE user_id = $1 ORDER BY id", [u.id]);
  assert.deepEqual(log.rows.map((r) => r.action), [`changed own username from "${name}" to "${name}x"`, `changed own username from "${name}x" to "${name}z"`]);
  assert.ok(log.rows.every((r) => r.is_from_suggestions && r.moderator_user_id === null));
  assert.equal((await c.query("SELECT username FROM feed.users WHERE id = $1", [u.id])).rows[0].username, name + "z");
});

test("settings: password and email changes need the current password; members can't change either", { skip }, async () => {
  const { c, n, mk, form, S } = await setup(), u = await mk("pw", "external"), m = await mk("mm", "member");
  const email = `pw${n}@example.org`, name = (await c.query("SELECT username FROM feed.users WHERE id = $1", [u.id])).rows[0].username;
  const f = (o) => S.saveSettings(u.id, form({ username: name, email, ...o })), ver = () => c.query("SELECT session_version v, email, email_verified_at e, password_digest d FROM feed.users WHERE id = $1", [u.id]).then((r) => r.rows[0]);
  await c.query("UPDATE feed.users SET email_verified_at = now() WHERE id = $1", [u.id]);
  const before = await ver();
  assert.match((await f({ password: "new password 456", confirm: "new password 456" })).error, /current password/);
  assert.match((await f({ password: "new password 456", confirm: "new password 456", currentPassword: "wrong" })).error, /current password/);
  assert.match((await f({ password: "new password 456", confirm: "different one 789", currentPassword: "old password 123" })).error, /confirmation/);
  assert.match((await f({ password: "short", confirm: "short", currentPassword: "old password 123" })).error, /.+/);
  assert.equal((await ver()).d, before.d);
  const r = await f({ password: "new password 456", confirm: "new password 456", currentPassword: "old password 123" });
  assert.ok(r.ok && r.newPassword);
  const after = await ver();
  assert.equal(after.v, before.v + 1, "other sessions end"); assert.notEqual(after.d, before.d);

  assert.match((await f({ email: `new${n}@example.org` })).error, /current password/);
  assert.match((await f({ email: "not an email", currentPassword: "new password 456" })).error, /Email/);
  const e = await f({ email: `New${n}@Example.org`, currentPassword: "new password 456" });
  assert.ok(e.ok && e.verify === `new${n}@example.org`);
  const moved = await ver();
  assert.equal(moved.email, `new${n}@example.org`); assert.equal(moved.e, null, "must be confirmed again");
  assert.match((await S.saveSettings(u.id, form({ username: name, email: (await c.query("SELECT email FROM feed.users WHERE id = $1", [m.id])).rows[0].email, currentPassword: "new password 456" }))).error, /can't be used/);

  // a member's form can carry email and password fields; they are ignored
  const mname = (await c.query("SELECT username, email FROM feed.users WHERE id = $1", [m.id])).rows[0];
  assert.ok((await S.saveSettings(m.id, form({ username: mname.username, email: "evil@example.org", password: "hijack password 1", confirm: "hijack password 1", about: "ok" }))).ok);
  const mrow = (await c.query("SELECT email, password_digest, session_version FROM feed.users WHERE id = $1", [m.id])).rows[0];
  assert.deepEqual([mrow.email, mrow.password_digest, mrow.session_version], [mname.email, null, 0]);
});

test("filters: only active tags (privileged ones for moderators), replaced each save, hidden from lists", { skip }, async () => {
  const { c, n, mk } = await setup(), { saveFilters, filtersIndex } = await import("../feed/models/filters.ts"), { listBy } = await import("../feed/models/stories.ts");
  const u = await mk("fl", "external");
  const cat = (await c.query("INSERT INTO feed.categories (category, token) VALUES ($1, $2) RETURNING id", ["fc" + n, "fc" + n])).rows[0].id;
  const tag = async (name, o = {}) => (await c.query("INSERT INTO feed.tags (tag, category_id, token, active, privileged) VALUES ($1, $2, $3, $4, $5) RETURNING id", [name + n, cat, "t" + name + n, o.active ?? true, o.privileged ?? false])).rows[0].id;
  const [plain, off, priv, keep] = [await tag("plain"), await tag("off", { active: false }), await tag("priv", { privileged: true }), await tag("keep")];
  const story = async (title, tags) => { const s = (await c.query("INSERT INTO feed.stories (user_id, title, short_id, token, last_edited_at) VALUES ($1, $2, $3, $4, now()) RETURNING id", [u.id, title, (title + n).slice(0, 2) + n.slice(-4), "s" + title + n])).rows[0]; for (const t of tags) await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [s.id, t]); return s.id; };
  const [a, b] = [await story("fa", [plain]), await story("fb", [keep])];
  const ids = async (filtered) => (await listBy({ where: "s.id = ANY($3::bigint[])", order: "s.id", params: [[a, b]] }, 1, u.id, filtered)).stories.map((s) => s.id);
  assert.equal((await saveFilters(u.id, false, ["plain" + n, "off" + n, "priv" + n, "nosuch"])).count, 1, "inactive, privileged and unknown names are ignored");
  assert.deepEqual(await ids(true), [b], "a filtered tag hides its stories");
  assert.deepEqual(await ids(false), [a, b], "but not on tag, domain or user pages");
  const row = (await filtersIndex(u.id)).find((x) => x.category === "fc" + n).tags;
  assert.deepEqual(row.map((t) => [t.tag, t.filtered]).sort(), [[`keep${n}`, false], [`plain${n}`, true], [`priv${n}`, false]], "inactive tags aren't offered");
  assert.equal((await saveFilters(u.id, true, ["priv" + n])).count, 1, "a moderator may filter a privileged tag");
  assert.deepEqual(await ids(true), [a, b], "each save replaces the last");
  await saveFilters(u.id, false, []);
  assert.equal((await c.query("SELECT count(*)::int n FROM feed.tag_filters WHERE user_id = $1", [u.id])).rows[0].n, 0);
});
