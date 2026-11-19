// Run with `npm test`. Identity on the community site: login handoff, session cookie, CSRF, passwords, names, and that nothing leaks or reflects.
// The DB tests need a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test (skipped otherwise; tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
process.env.CONFIG_PATH = "/nonexistent"; process.env.AUTH_SECRET = "test-secret"; process.env.ADMIN_EMAILS = "boss@kzoomakers.org";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const A = await import("../feed/auth.ts");
const STATE = "s".repeat(32), AUD = "talk.test";
const mint = (o = {}, now) => A.mintHandoff({ email: "Pat@Example.org", role: "member", uid: 7, state: STATE, ret: "/newest", ...o }, AUD, now);
const memory = () => { const seen = new Set(); return async (jti) => !seen.has(jti) && !!seen.add(jti); };
const verify = (t, o = {}) => A.verifyHandoff(t, { aud: AUD, state: STATE, consume: memory(), ...o });

test("handoff: a fresh token verifies once, with the email lowercased and the role and return path it was minted with", async () => {
  const consume = memory(), t = mint();
  const c = await verify(t, { consume });
  assert.deepEqual([c.email, c.role, c.uid, c.ret], ["pat@example.org", "member", 7, "/newest"]);
  assert.equal(await verify(t, { consume }), null, "replay is refused");
});

test("handoff: tampered, truncated, expired, wrong audience, wrong or missing browser state are all refused", async () => {
  const t = mint(), [body, sig] = t.split(".");
  const forged = (patch) => Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url")), ...patch })).toString("base64url") + "." + sig;
  for (const bad of [forged({ role: "admin" }), forged({ email: "boss@kzoomakers.org" }), forged({ aud: "x" }), body + "." + sig.slice(1), body + "." + sig + "a", body, "", "a.b.c", sig + "." + body])
    assert.equal(await verify(bad), null, bad.slice(0, 30));
  assert.equal(await verify(mint({}, Date.now() - 61_000)), null, "older than 60 seconds");
  assert.ok(await verify(mint({}, Date.now() - 55_000)), "still inside the window");
  assert.equal(await verify(mint({}, Date.now() + 60_000)), null, "from the future");
  assert.equal(await verify(t, { aud: "evil.test" }), null, "wrong audience");
  assert.equal(await verify(t, { state: "t".repeat(32) }), null, "another browser's state");
  assert.equal(await verify(t, { state: "" }), null, "no state cookie");
});

test("handoff: a token that fails any check does not use up its id", async () => {
  const consume = memory(), t = mint();
  assert.equal(await verify(t, { consume, state: "t".repeat(32) }), null);
  assert.ok(await verify(t, { consume }));
});

test("handoff: tokens are not interchangeable with session cookies or other secrets", async () => {
  assert.equal(await verify(A.sessionValue(1, 0)), null);
  assert.equal(A.readSession(mint()), null);
  process.env.AUTH_SECRET = "other"; assert.equal(await verify(mint({}, Date.now() - 1000).replace(/.$/, "x")), null); process.env.AUTH_SECRET = "test-secret";
  const t = mint(); process.env.AUTH_SECRET = "other"; assert.equal(await verify(t), null, "signed with a different secret"); process.env.AUTH_SECRET = "test-secret";
});

test("minting refuses a weak state, and the return path in a token is always a safe one", async () => {
  assert.throws(() => mint({ state: "short" }));
  assert.equal((await verify(mint({ ret: "//evil.com" }))).ret, "/");
});

test("return paths stay on this site and never loop back into login", () => {
  for (const ok of ["/", "/newest", "/s/abc123/the_title", "/~alice", "/top/3d", "/newest/page/2", "/search?q=laser&what=stories"]) assert.equal(A.safeReturn(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/a b", "/<script>", "/%2f%2fevil.com", "/../x", "/login", "/login/handoff?t=1", "/auth/logout", "/signup", "/a\r\nSet-Cookie: x=1", "/" + "a".repeat(300), "", null, undefined]) assert.equal(A.safeReturn(bad), "/", String(bad));
});

test("session cookie: round trip, tampering, expiry, and a different version after revocation", () => {
  const v = A.sessionValue(42, 3);
  assert.deepEqual(A.readSession(v), { id: 42, ver: 3 });
  const [id, exp, ver, mac] = v.split(".");
  for (const bad of [`43.${exp}.${ver}.${mac}`, `${id}.${exp}.4.${mac}`, `${id}.${Number(exp) + 1}.${ver}.${mac}`, `${id}.${exp}.${ver}.${mac}x`, v + ".x", "", "1.2.3", undefined]) assert.equal(A.readSession(bad), null, String(bad));
  assert.equal(A.readSession(A.sessionValue(1, 0, Date.now() - 31 * 864e5)), null, "expired");
});

test("CSRF: a form post must come from this very site; account forms also need the token tied to the login", () => {
  const h = (o) => new Headers(o);
  assert.ok(A.originOk(h({ host: "talk.test", origin: "https://talk.test" })));
  assert.ok(A.originOk(h({ host: "talk.test", origin: "https://talk.test", "sec-fetch-site": "same-origin" })));
  for (const bad of [{ host: "talk.test" }, { host: "talk.test", origin: "https://evil.test" }, { host: "talk.test", origin: "null" }, { host: "talk.test", origin: "https://talk.test.evil.test" },
    { host: "talk.test", origin: "https://talk.test", "sec-fetch-site": "cross-site" }, { host: "talk.test", origin: "https://talk.test", "sec-fetch-site": "same-site" }, { origin: "https://talk.test" }])
    assert.ok(!A.originOk(h(bad)), JSON.stringify(bad));
  const a = A.sessionValue(1, 0), b = A.sessionValue(2, 0);
  assert.ok(A.csrfOk(a, A.csrfFor(a)));
  assert.ok(!A.csrfOk(a, A.csrfFor(b)) && !A.csrfOk(a, "") && !A.csrfOk("", A.csrfFor(a)) && !A.csrfOk(a, A.csrfFor(a) + "x"));
});

test("passwords: scrypt digest checks out, wrong ones and junk digests don't, and the rules hold", async () => {
  const d = await A.hashPassword("correct horse battery");
  assert.match(d, /^scrypt\$32768\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.ok(await A.checkPassword("correct horse battery", d));
  for (const bad of ["wrong", "", "correct horse batter"]) assert.ok(!(await A.checkPassword(bad, d)));
  for (const junk of ["", "x", "scrypt$1$aa$bb", "scrypt$32768$$", "bcrypt$32768$aa$bb"]) assert.ok(!(await A.checkPassword("x", junk)), junk);
  assert.ok(!(await A.checkPassword("whatever", A.DUMMY_DIGEST)));
  assert.notEqual(d, await A.hashPassword("correct horse battery"), "salted");
  assert.ok(A.passwordProblem("short") && A.passwordProblem("a".repeat(201)) && A.passwordProblem("pat@example.org", "Pat@Example.org") && !A.passwordProblem("a long enough one"));
});

test("usernames: letters, digits, _ and - only; reserved names refused", () => {
  for (const ok of ["pat", "Pat_the-maker", "a1", "x".repeat(24)]) assert.equal(A.usernameProblem(ok), "", ok);
  for (const bad of ["", "a", "-pat", "_pat", "pat smith", "pat<b>", "pat'--", "pät", "x".repeat(25), "pat.rss", "a/b", "Admin", "ROOT", "inactive-user"]) assert.ok(A.usernameProblem(bad), bad);
});

test("the main-site route says 404 while the feed is switched off, whoever asks", async () => {
  const { GET } = await import("../app/feed-sso/route.ts");
  for (const u of ["https://x.test/feed-sso?role=member&state=" + STATE, "https://x.test/feed-sso?role=admin&state=" + STATE, "https://x.test/feed-sso"])
    assert.equal((await GET(new Request(u))).status, 404);
});

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
test("static checks: feed code never writes to site_users, never injects raw HTML, and every form handler checks the origin", () => {
  const files = [...walk("feed"), ...walk("app/feed-site"), "app/feed-sso/route.ts"].filter((f) => /\.tsx?$/.test(f));
  const identity = files.filter((f) => /feed\/(auth|identity)\.ts$|views\/auth\.tsx$|app\/feed-(site\/(login|signup|auth)\/|sso\/)/.test(f));
  assert.ok(identity.length >= 12, "the identity files are found");
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""), /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+site_users/i, `${f} writes to site_users`);
  // (story and comment pages render sanitized markdown through one helper, views/comment.tsx; the account pages and routes render nothing but escaped text)
  for (const f of identity) assert.doesNotMatch(fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""), /dangerouslySetInnerHTML|innerHTML|eval\(|new Function/, `${f} injects raw HTML`);
  for (const f of files.filter((f) => /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)/.test(fs.readFileSync(f, "utf8"))))
    assert.match(fs.readFileSync(f, "utf8"), /originOk\(/, `${f} accepts a post without checking where it came from`);
});

// ---- database: who ends up with which account
const ADMIN = "boss@kzoomakers.org";
async function setup() {
  const { conn } = await import("../lib/db.ts"), id = await import("../feed/identity.ts"), c = await conn();
  const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  // a finished member: approved, onboarding done, profile complete, one emergency contact
  const site = async (email) => {
    const id = (await c.query("INSERT INTO site_users (email, name, verified_at, approval, onboarding, phone, address1) VALUES ($1, 'Real Name', now(), 'approved', 'done', '555', '1 Main St') RETURNING id", [email])).rows[0].id;
    await c.query("INSERT INTO emergency_contacts (user_id, first_name, last_name, phone, relationship) VALUES ($1, 'Kin', 'Dred', '555', 'friend')", [id]);
    return id;
  };
  return { c, id, tag, site, claims: (o) => ({ aud: AUD, email: "x@example.org", role: "member", uid: null, state: STATE, ret: "/", iat: 0, exp: 0, jti: "j", ...o }) };
}

test("handoff accounts: member and admin get a feed account, never a site_users row, and the role is decided here, not by the token", { skip }, async () => {
  const { c, id, tag, site, claims } = await setup(), before = (await c.query("SELECT count(*)::int n FROM site_users")).rows[0].n;
  const email = `m${tag}@example.org`, uid = await site(email), after = (await c.query("SELECT count(*)::int n FROM site_users")).rows[0].n;
  const cookie = await id.loginFromHandoff(claims({ email, uid }));
  const v = await id.viewerFor(cookie);
  assert.deepEqual([v.kind, v.isAdmin, v.isModerator, v.username, v.verified], ["member", false, false, null, true], "no username until they pick one");
  assert.equal((await c.query("SELECT count(*)::int n FROM site_users")).rows[0].n, after);
  assert.ok(after >= before);
  await assert.rejects(id.loginFromHandoff(claims({ email, uid, role: "admin" })), { code: "not_allowed" }, "a member cannot claim admin");
  await assert.rejects(id.loginFromHandoff(claims({ email: "nobody@example.org", role: "admin" })), { code: "not_allowed" });
  await assert.rejects(id.loginFromHandoff(claims({ email: `z${tag}@example.org`, uid })), { code: "not_allowed" }, "email must match the member record");
  await assert.rejects(id.loginFromHandoff(claims({ email: `q${tag}@example.org`, uid: 999999999 })), { code: "not_allowed" });
  const a = await id.viewerFor(await id.loginFromHandoff(claims({ email: ADMIN, role: "admin" })));
  assert.deepEqual([a.kind, a.isAdmin, a.isModerator], ["admin", true, true]);
  await c.query("DELETE FROM feed.users WHERE lower(email) = ANY($1)", [[email, ADMIN]]); await c.query("DELETE FROM site_users WHERE id = $1", [uid]);
});

test("members who are disabled, rejected or still in the queue cannot get in, and lose a session they had", { skip }, async () => {
  const { c, id, tag, site, claims } = await setup();
  for (const [name, fix] of [["disabled", "disabled_at = now()"], ["rejected", "approval = 'rejected'"], ["pending", "approval = 'pending'"]]) {
    const email = `${name}${tag}@example.org`, uid = await site(email), cookie = await id.loginFromHandoff(claims({ email, uid }));
    assert.ok(await id.viewerFor(cookie));
    await c.query(`UPDATE site_users SET ${fix} WHERE id = $1`, [uid]);
    assert.equal(await id.viewerFor(cookie), null, `${name}: session ended`);
    await assert.rejects(id.loginFromHandoff(claims({ email, uid })), { code: "not_allowed" }, name);
    await c.query("DELETE FROM feed.users WHERE lower(email) = $1", [email]); await c.query("DELETE FROM site_users WHERE id = $1", [uid]);
  }
});

test("banned feed users can't log in by any route, and a ban ends their session", { skip }, async () => {
  const { c, id, tag, site, claims } = await setup(), email = `b${tag}@example.org`, uid = await site(email), cookie = await id.loginFromHandoff(claims({ email, uid }));
  await c.query("UPDATE feed.users SET banned_at = now() WHERE lower(email) = $1", [email]);
  assert.equal(await id.viewerFor(cookie), null);
  await assert.rejects(id.loginFromHandoff(claims({ email, uid })), { code: "banned" });
  await c.query("DELETE FROM feed.users WHERE lower(email) = $1", [email]); await c.query("DELETE FROM site_users WHERE id = $1", [uid]);
});

test("an admin removed from the allow-list is no longer one on the next request", { skip }, async () => {
  const { c, id, claims } = await setup();
  const cookie = await id.loginFromHandoff(claims({ email: ADMIN, role: "admin" }));
  assert.ok((await id.viewerFor(cookie)).isAdmin);
  process.env.ADMIN_EMAILS = "someone-else@kzoomakers.org";
  try { assert.equal(await id.viewerFor(cookie), null); assert.equal((await c.query("SELECT is_admin FROM feed.users WHERE lower(email) = $1", [ADMIN])).rows[0].is_admin, false); }
  finally { process.env.ADMIN_EMAILS = ADMIN; await c.query("DELETE FROM feed.users WHERE lower(email) = $1", [ADMIN]); }
});

test("handoff ids are single use in the database too", { skip }, async () => {
  const { id, tag } = await setup(), jti = "t" + tag, exp = Math.floor(Date.now() / 1000) + 60;
  assert.equal(await id.consumeHandoff(jti, exp), true);
  assert.equal(await id.consumeHandoff(jti, exp), false);
  assert.deepEqual(await Promise.all([1, 2, 3].map(() => id.consumeHandoff("p" + tag, exp))).then((r) => r.filter(Boolean).length), 1, "parallel replays: one wins");
});

test("someone who registers with another person's address can't use that account once the real owner arrives", { skip }, async () => {
  const { c, id, tag, site, claims } = await setup(), email = `v${tag}@example.org`;
  const attacker = (await c.query("INSERT INTO feed.users (email, password_digest, token, kind) VALUES ($1, $2, 'x' || $3, 'external') RETURNING id", [email, await A.hashPassword("attacker password"), tag])).rows[0].id;
  const old = await id.viewerFor(A.sessionValue(attacker, 0));
  assert.ok(old);
  const uid = await site(email);
  await id.loginFromHandoff(claims({ email, uid }));
  assert.equal(await id.viewerFor(A.sessionValue(attacker, 0)), null, "the attacker's old session is dead");
  const u = (await c.query("SELECT kind, password_digest FROM feed.users WHERE id = $1", [attacker])).rows[0];
  assert.deepEqual([u.kind, u.password_digest], ["member", null], "upgraded, and the attacker's password is gone");
  await assert.rejects(id.passwordLogin(new Request("https://t.test"), email, "attacker password"), { code: "login_bad" }, "members have no password login");
  await c.query("DELETE FROM feed.users WHERE id = $1", [attacker]); await c.query("DELETE FROM site_users WHERE id = $1", [uid]);
});

test("usernames are chosen once and are unique ignoring case", { skip }, async () => {
  const { c, id, tag } = await setup(), mk = async (e) => (await c.query("INSERT INTO feed.users (email, token, kind) VALUES ($1, $2, 'member') RETURNING id", [e, e])).rows[0].id;
  const a = await mk(`a${tag}@e.org`), b = await mk(`b${tag}@e.org`), name = `Maker${tag}`.slice(0, 24);
  await id.chooseUsername(a, name);
  await assert.rejects(id.chooseUsername(b, name.toLowerCase()), { code: "username_taken" });
  await assert.rejects(id.chooseUsername(a, name + "x"), { code: "username_taken" }, "no renaming");
  await assert.rejects(id.chooseUsername(b, "<script>"), { code: "username_bad" });
  await c.query("DELETE FROM feed.users WHERE id = ANY($1)", [[a, b]]);
});

test("reset links work once, expire, end other sessions, and external accounts only", { skip }, async () => {
  const { c, id, tag } = await setup(), email = `r${tag}@example.org`, req = new Request("https://t.test", { headers: { "x-forwarded-for": "1.2.3.4" } });
  const uid = (await c.query("INSERT INTO feed.users (email, password_digest, token, kind) VALUES ($1,$2,$3,'external') RETURNING id", [email, await A.hashPassword("old password 123"), "r" + tag])).rows[0].id;
  const old = await id.viewerFor(A.sessionValue(uid, 0));
  assert.ok(old);
  const t = "tok" + tag, { createHash } = await import("node:crypto"), h = createHash("sha256").update(t).digest("hex");
  await c.query("INSERT INTO feed.auth_tokens (hash, user_id, purpose, expires_at) VALUES ($1,$2,'reset', now() + interval '1 hour')", [h, uid]);
  assert.ok(await id.resetLinkValid(t));
  await assert.rejects(id.setNewPassword(t, "short"), { code: "password_bad" });
  assert.ok(await id.resetLinkValid(t), "a bad password doesn't use the link up");
  const cookie = await id.setNewPassword(t, "brand new password");
  assert.ok(await id.viewerFor(cookie));
  assert.equal(await id.viewerFor(A.sessionValue(uid, 0)), null, "older sessions end");
  await assert.rejects(id.setNewPassword(t, "another new password"), { code: "link_bad" }, "single use");
  await c.query("INSERT INTO feed.auth_tokens (hash, user_id, purpose, expires_at) VALUES ($1,$2,'reset', now() - interval '1 second')", [h, uid]);
  await assert.rejects(id.setNewPassword(t, "another new password"), { code: "link_bad" }, "expired");
  await assert.doesNotReject(id.passwordLogin(req, email, "brand new password"));
  await assert.rejects(id.passwordLogin(req, email, "old password 123"), { code: "login_bad" });
  await c.query("DELETE FROM feed.users WHERE id = $1", [uid]);
});

test("external registration: refuses weak input and closed sign-up, needs a live invite in invite mode, and answers the same for a taken address", { skip }, async () => {
  const { c, id, tag } = await setup(), ip = (n) => new Request("https://t.test", { headers: { "x-forwarded-for": `10.${n}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const { saveFeedConfig } = await import("../feed/config.ts"), email = `e${tag}@example.org`;
  try {
    await saveFeedConfig({ enabled: true, signup: "closed" }, "test");
    await assert.rejects(id.register(ip(1), { email, password: "a good password", code: "" }), { code: "signup_closed" });
    await saveFeedConfig({ enabled: true, signup: "open" }, "test");
    await assert.rejects(id.register(ip(2), { email: "not an email", password: "a good password", code: "" }), { code: "email_bad" });
    await assert.rejects(id.register(ip(3), { email, password: "short", code: "" }), { code: "password_bad" });
    await id.register(ip(4), { email, password: "a good password", code: "" });
    const u = (await c.query("SELECT kind, email_verified_at, password_digest FROM feed.users WHERE lower(email) = $1", [email])).rows[0];
    assert.deepEqual([u.kind, u.email_verified_at, u.password_digest.startsWith("scrypt$")], ["external", null, true], "unverified until the link is used");
    await assert.doesNotReject(id.register(ip(5), { email, password: "someone elses try", code: "" }), "same answer for a taken address");
    assert.ok(await id.passwordLogin(ip(6), email, "a good password"), "the first password still the only one");
    await saveFeedConfig({ enabled: true, signup: "invite" }, "test");
    await assert.rejects(id.register(ip(7), { email: `i${email}`, password: "a good password", code: "" }), { code: "invite_bad" });
    await assert.rejects(id.register(ip(8), { email: `i${email}`, password: "a good password", code: "nope" }), { code: "invite_bad" });
    const inviter = (await c.query("SELECT id FROM feed.users WHERE lower(email) = $1", [email])).rows[0].id;
    await c.query("INSERT INTO feed.invitations (user_id, code, token) VALUES ($1, $2, $2)", [inviter, "code" + tag]);
    await c.query("INSERT INTO feed.invitations (user_id, code, token, created_at) VALUES ($1, $2, $2, now() - interval '400 days')", [inviter, "old" + tag]);
    await assert.rejects(id.register(ip(9), { email: `i${email}`, password: "a good password", code: "old" + tag }), { code: "invite_bad" }, "expired code");
    await id.register(ip(10), { email: `i${email}`, password: "a good password", code: "code" + tag });
    await assert.rejects(id.register(ip(11), { email: `j${email}`, password: "a good password", code: "code" + tag }), { code: "invite_bad" }, "a code works once");
  } finally {
    await saveFeedConfig({ enabled: false }, "test");
    await c.query("DELETE FROM feed.invitations WHERE code LIKE ANY($1)", [[`code${tag}`, `old${tag}`]]); await c.query("DELETE FROM feed.users WHERE email LIKE $1", [`%${tag}@example.org`]);
  }
});

test("stored text is never shown as raw markup: plain text is escaped, markup goes through the allow-list", async () => {
  const { feedHtml } = await import("../feed/safe-html.ts");
  assert.equal(feedHtml('hi <img src=x onerror=alert(1)>'), "hi &lt;img src=x onerror=alert(1)&gt;");
  assert.equal(feedHtml(null), "");
  for (const bad of ['<p onclick="x()">a</p>', '<a href="javascript:alert(1)">a</a>', '<script>alert(1)</script><p>a</p>', '<img src=x onerror=alert(1)>', '<svg onload=alert(1)>', '<iframe src="https://evil.test"></iframe>', '<a href="&#106;avascript:alert(1)">a</a>', '<p style="x">a</p>'])
    assert.doesNotMatch(feedHtml(bad), /onerror|onclick|onload|javascript:|<script|<svg|evil\.test|style=/i, bad);
  assert.equal(feedHtml('<p>ok <a href="https://example.org/x">link</a></p>'), '<p>ok <a href="https://example.org/x">link</a></p>');
});

test("the feed's CSP is closed down: no outside scripts, no framing, forms and base only to itself", async () => {
  const { FEED_CSP } = await import("../feed/csp.ts");
  const d = Object.fromEntries(FEED_CSP.split("; ").map((x) => [x.split(" ")[0], x.split(" ").slice(1).join(" ")]));
  assert.equal(d["script-src"], "'self' 'unsafe-inline'");
  assert.deepEqual([d["object-src"], d["frame-ancestors"], d["base-uri"], d["form-action"], d["connect-src"]], ["'none'", "'none'", "'none'", "'self'", "'self'"]);
  assert.doesNotMatch(FEED_CSP, /google|unsafe-eval|\*/);
  const mw = fs.readFileSync("middleware.ts", "utf8");
  assert.match(mw, /isFeedHost[\s\S]{0,80}FEED_CSP/, "middleware applies it on the feed host");
});
