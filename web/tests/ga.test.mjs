import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
const { shape, parseKey, cached, CACHE_MS, accessToken } = await import("../lib/ga.ts");
const { PRIVATE } = await import("../lib/ga-private.ts");

const rows = (...r) => ({ rows: r.map((x) => ({ dimensionValues: x.d.map((value) => ({ value })), metricValues: x.m.map((value) => ({ value: String(value) })) })) });

test("ga: shape reads totals, groups sources by kind, and fills quiet days up to Google's last day", () => {
  const out = shape(7, [
    rows({ d: ["20261101"], m: [5, 9] }),
    rows({ d: ["date_range_0"], m: [10, 20, 0.5, 90] }, { d: ["date_range_1"], m: [8, 10, 0.4, 80] }),
    rows({ d: ["/tours"], m: [7] }),
    rows({ d: ["chatgpt.com"], m: [3] }, { d: ["google"], m: [4] }, { d: ["(direct)"], m: [2] }, { d: ["example.org"], m: [1] }),
    rows({ d: ["United States"], m: [6] }),
  ]);
  assert.equal(out.daily.length, 7); // Oct 26 .. Nov 1
  assert.deepEqual(out.daily.at(-1), { d: "2026-11-01", users: 5, views: 9 }); // no invented day after Google's last
  assert.deepEqual(out.daily[0], { d: "2026-10-26", users: 0, views: 0 });
  assert.deepEqual([out.users, out.views, out.prev.users, out.prev.views], [10, 20, 8, 10]);
  assert.deepEqual(out.kinds, { ai: 3, search: 4, direct: 2, other: 1 });
});

test("ga: an empty answer from Google gives zeros, not a crash", () => {
  const out = shape(7, [{}, {}, {}, {}, {}]);
  assert.deepEqual([out.users, out.daily.length], [0, 0]);
});

test("ga: only a service-account key is accepted", () => {
  assert.throws(() => parseKey("nope"), /valid JSON/);
  assert.throws(() => parseKey('{"type":"authorized_user"}'), /service-account/);
  assert.equal(parseKey('{"type":"service_account","client_email":"a@b","private_key":"k"}').client_email, "a@b");
});

const rep = (n) => ({ at: n, report: { users: n } });
test("ga cache: a copy under an hour old is used without asking Google", async () => {
  let calls = 0;
  const r = await cached(rep(1000), async () => { calls++; return rep(2); }, 1000 + CACHE_MS - 1);
  assert.deepEqual([calls, r.stale, r.at], [0, false, 1000]);
});
test("ga cache: an old copy is refreshed", async () => {
  const r = await cached(rep(1000), async () => rep(9), 1000 + CACHE_MS);
  assert.deepEqual([r.at, r.stale], [9, false]);
});
test("ga cache: when Google fails the old copy is shown as stale with the reason, and with no copy the error is raised", async () => {
  const boom = async () => { throw new Error("down"); };
  const old = await cached(rep(1000), boom, 1000 + CACHE_MS);
  assert.deepEqual([old.stale, old.error], [true, "down"]);
  await assert.rejects(cached(undefined, boom), /down/);
});

test("ga login: the token request carries a JWT that the service account's public key verifies", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const real = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => { body = init.body; return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 }); };
  try {
    assert.equal(await accessToken({ client_email: "sa@x.iam", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }), "tok");
  } finally { globalThis.fetch = real; }
  assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, c, sig] = body.get("assertion").split(".");
  assert.equal(JSON.parse(Buffer.from(c, "base64url")).iss, "sa@x.iam");
  assert.ok(createVerify("RSA-SHA256").update(h + "." + c).verify(publicKey, Buffer.from(sig, "base64url")));
});

test("ga tag: never runs on pages that carry tokens or belong to signed-in people", () => {
  for (const p of ["/sign/t/abc", "/sign/abc", "/tours/cancel", "/tours/respond/x", "/members", "/members/directory", "/login", "/admin", "/admin-login", "/blog/login", "/mail/unsubscribe", "/account"]) assert.ok(PRIVATE.test(p), p);
  for (const p of ["/", "/pricing", "/tours", "/blog/some-post", "/privacy", "/about"]) assert.ok(!PRIVATE.test(p), p);
});
