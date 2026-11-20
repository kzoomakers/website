// Run with `npm test`. Public Lobsters URLs on the feed host -> internal /feed-site routes.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { feedRewrite } = await import("../feed/rewrite.ts");
const { normalize, DEFAULTS, isFeedHost } = await import("../feed/config.ts");
const rw = (p) => { const r = feedRewrite(p); return !r ? null : "pass" in r ? "pass" : "rewrite" in r ? r.rewrite : `${r.status} ${r.redirect}`; };

test("pages map under /feed-site, ~user maps to /u, .rss and .json become handlers", () => {
  const T = {
    "/": "/feed-site", "/newest": "/feed-site/newest", "/newest/page/2": "/feed-site/newest/page/2", "/s/abc123/some-title": "/feed-site/s/abc123/some-title",
    "/~alice": "/feed-site/u/alice", "/~alice/stories/page/3": "/feed-site/u/alice/stories/page/3", "/~alice/comments.rss": "/feed-site/rss/u/alice/comments", "/~alice.json": "/feed-site/json/u/alice",
    "/t/c,python.rss": "/feed-site/rss/t/c,python", "/newest.json": "/feed-site/json/newest", "/top/1w.rss": "/feed-site/rss/top/1w", "/domains/example.com.rss": "/feed-site/rss/domains/example.com",
    "/domains/example.com": "/feed-site/domains/example.com", "/origins/github.com/user": "/feed-site/origins/github.com/user", "/origins/github.com/user.rss": "/feed-site/rss/origins/github.com/user",
    "/c/abc123.json": "/feed-site/json/c/abc123", "/rss": "/feed-site/rss/hottest", "/hottest": "/feed-site/json/hottest", "/newest/": "/feed-site/newest",
  };
  for (const [from, to] of Object.entries(T)) assert.equal(rw(from), to, from);
});

test("legacy URLs redirect the way routes.rb does", () => {
  const T = {
    "/u": "301 /users", "/u/alice": "301 /~alice", "/@alice": "301 /~alice", "/u/alice/standing": "301 /~alice/standing", "/newest/alice": "301 /~alice/stories", "/newest/alice/page/2": "301 /~alice/stories/page/2",
    "/threads/alice": "301 /~alice/threads", "/replies": "301 /inbox/all", "/replies/stories/page/2": "301 /inbox/all", "/replies/unread": "301 /inbox/unread", "/top/rss": "301 /top.rss", "/top/1w/rss": "301 /top/1w.rss",
    "/comments/rss": "301 /comments.rss", "/upvoted": "301 /upvoted/stories", "/domain/example.com": "301 /domains/example.com", "/domains/example.com/alice": "301 /origins/example.com/alice", "/mod/notes": "301 /mod",
  };
  for (const [from, to] of Object.entries(T)) assert.equal(rw(from), to, from);
  assert.equal(rw("/domains/example.com/origins"), "/feed-site/domains/example.com/origins", "a real route, not an author");
});

test("the internal prefix is never reachable by name; shared static files pass through", () => {
  assert.equal(feedRewrite("/feed-site"), null);
  assert.equal(feedRewrite("/feed-site/newest"), null);
  for (const p of ["/feed/css/application.css", "/_next/static/x.js", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/uploads/feed/stories/a.webp"]) assert.equal(rw(p), "pass", p);
});

// Every path literal in Lobsters' routes.rb (present on a dev machine, not in CI) must be handled, never fall through to null.
const routes = new URL("../../lobsters/config/routes.rb", import.meta.url).pathname;
test("every path in lobsters/config/routes.rb is handled", { skip: !fs.existsSync(routes) }, () => {
  const paths = [...fs.readFileSync(routes, "utf8").matchAll(/\b(?:get|post|match)\s+"(\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 100);
  for (const raw of paths) {
    const p = raw.replace(/\(.*$/, "").replace(/:[a-z_]+/g, "x").replace(/\.format$/, "");
    assert.ok(feedRewrite(p), `${raw} -> ${p}`);
  }
});

test("feed settings: bad values fall back to defaults, good ones stay", () => {
  assert.deepEqual(normalize(undefined), DEFAULTS);
  assert.equal(DEFAULTS.enabled, false, "off until launch");
  const c = normalize({ enabled: true, signup: "bogus", invites: { who: "staff", perUserLimit: 9999, expiryDays: 0 }, newUserDays: 3.5, extra: 1 });
  assert.equal(c.enabled, true); assert.equal(c.signup, "invite"); assert.equal(c.invites.who, "staff");
  assert.equal(c.invites.perUserLimit, 100); assert.equal(c.invites.expiryDays, 1); assert.equal(c.newUserDays, DEFAULTS.newUserDays); assert.ok(!("extra" in c));
});

test("only the feed host (or FEED_DEV outside production) is the feed", () => {
  assert.ok(isFeedHost("talk.kzoomakers.org")); assert.ok(isFeedHost("TALK.kzoomakers.org:443"));
  assert.ok(!isFeedHost("kzoomakers.org")); assert.ok(!isFeedHost("talk.kzoomakers.org.evil.com")); assert.ok(!isFeedHost(null));
});
