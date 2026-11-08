// Run with `npm test`. Small checks on the rules that keep the public parts of the site safe.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL; // tests must never touch a real database (the limiter then uses memory)
import { test } from "node:test";
import assert from "node:assert";
import { judge } from "../lib/spam.ts";
import { clickOk, same, sign } from "../lib/signing.ts";
import { tokenAllows } from "../lib/ntfy-token.ts";
import { cleanHtml } from "../lib/sanitize.ts";

const base = { mode: "none", blocked: ["viagra"], priorApproved: 0, duplicate: false };

test("spam filter", () => {
  assert.equal(judge("Nice post!", base).status, "approved");
  assert.equal(judge("buy viagra now", base).status, "spam");
  assert.equal(judge("see http://a.com", base).status, "pending"); // a link from a first-time commenter is held
  assert.equal(judge("hi", { ...base, duplicate: true }).status, "spam");
});

test("email click links: only our own signature is accepted", () => {
  const sig = sign("secret", "tok", "https://kzoomakers.org/x");
  assert.ok(clickOk("secret", "tok", "https://kzoomakers.org/x", sig));
  assert.ok(!clickOk("secret", "tok", "https://evil.example/", sig)); // same signature, different target
  assert.ok(!clickOk("other", "tok", "https://kzoomakers.org/x", sig));
  assert.ok(!clickOk("secret", "tok", "javascript:alert(1)", sign("secret", "tok", "javascript:alert(1)")));
  assert.ok(same("abc", "abc") && !same("abc", "abd") && !same("abc", "ab"));
});

test("ntfy tokens", () => {
  const t = { scopes: ["read"], topics: ["a"] };
  assert.ok(tokenAllows(t, ["a"], false));
  assert.ok(!tokenAllows(t, ["a"], true)); // read-only token can't publish
  assert.ok(!tokenAllows(t, ["a", "b"], false)); // every topic must be covered
  assert.ok(tokenAllows({ scopes: ["publish"], topics: [] }, ["x", "y"], true)); // no topic list = all topics
});

test("blog HTML loses scripts but keeps formatting", () => {
  const out = cleanHtml(`<p onclick="x()">Hi <b>there</b></p><script>alert(1)</script><a href="javascript:alert(1)">a</a><a href="jav&#x09;ascript:alert(1)">b</a>
    <a href="/ok">ok</a><img src="x" onerror="alert(1)"><iframe src="https://evil.example/"></iframe><iframe src="https://www.youtube.com/embed/abc"></iframe><iframe srcdoc="<script>1</script>" src="https://www.youtube.com/embed/abc"></iframe>`);
  assert.doesNotMatch(out, /script|onclick|onerror|javascript|evil|srcdoc/i);
  assert.match(out, /<b>there<\/b>/);
  assert.match(out, /href="\/ok"/);
  assert.match(cleanHtml('<a href="about.html">x</a><a href="#top">y</a>'), /about\.html.*#top/); // relative links survive
  assert.match(out, /youtube\.com\/embed\/abc/);
  assert.equal(cleanHtml("Plain text <b>stays</b>"), "Plain text <b>stays</b>"); // not HTML: escaped at display
});

test("sanitizer is an allow-list: svg animate, style and unknown tags can't carry script", () => {
  const out = cleanHtml('<p style="x">hi</p><svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg><custom-tag onclick="x()">kept <b>text</b></custom-tag>');
  assert.doesNotMatch(out, /svg|animate|javascript|style|custom-tag|onclick/i);
  assert.match(out, /kept <b>text<\/b>/);
});

test("rate limiter allows `max` hits per window, then refuses", async () => {
  const { hit } = await import("../lib/limit.ts");
  const k = "same";
  assert.deepEqual([await hit(k, 2, 1000), await hit(k, 2, 1000), await hit(k, 2, 1000)], [true, true, false]);
});

test("signer unlock cookie needs a secret and can't be forged", async () => {
  const { unlockCookie, unlocked } = await import("../lib/sign-access.ts");
  delete process.env.PII_CRYPTO_SECRET;
  assert.throws(() => unlockCookie(1));
  process.env.PII_CRYPTO_SECRET = "s1";
  const c = unlockCookie(7);
  assert.ok(unlocked(7, c.value));
  assert.ok(!unlocked(8, c.value)); // another signer's id
  assert.ok(!unlocked(7, c.value.replace(/.$/, (x) => (x === "0" ? "1" : "0")))); // tampered mac
});

test("api keys and the approval gate are enforced in code", async () => {
  const { readFileSync } = await import("node:fs");
  const k = readFileSync("lib/api-keys.ts", "utf8");
  assert.match(k, /expires_at IS NULL OR expires_at > now\(\)/); // expired keys refused
  assert.match(k, /k\.scopes\.includes\(scope\)/); // a key needs the scope
  assert.match(readFileSync("lib/readers.ts", "utf8"), /approval === "approved" && u\.onboarding === "done"/); // members-only needs approval
});
