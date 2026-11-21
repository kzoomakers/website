// The DB part needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. The payload and URL checks always run.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
process.env.PII_CRYPTO_SECRET ||= "test-secret";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const D = await import("../lib/training/discord.ts");
const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-0123";

test("webhook address: only Discord's own host and path shape", () => {
  assert.ok(D.validWebhook(HOOK) && D.validWebhook(HOOK.replace("discord.com", "ptb.discordapp.com")));
  for (const bad of ["http://discord.com/api/webhooks/123456/" + "a".repeat(30), "https://evil.test/api/webhooks/123456/" + "a".repeat(30), "https://discord.com.evil.test/api/webhooks/123456/" + "a".repeat(30), "https://discord.com/api/webhooks/123456/" + "a".repeat(30) + "/x", "https://127.0.0.1/", ""]) assert.equal(D.validWebhook(bad), false, bad);
  assert.ok(!D.mask(HOOK).includes("abcdefgh"));
});

test("payload: no pings, markdown escaped, sizes capped", () => {
  const cfg = { name: "Club", avatar: "", embed: true, color: "#112233", templates: ["Congrats {{name}} on {{tool}}"] };
  const p = D.buildPayload(cfg, { name: "@everyone <@123> *bold*", tool: "x".repeat(5000) }, 0);
  assert.deepEqual(p.allowed_mentions, { parse: [] });
  assert.ok(p.embeds[0].description.includes("\\@everyone") && p.embeds[0].description.includes("\\<\\@123\\>"));
  assert.ok(p.embeds[0].description.length <= 500 && p.embeds[0].fields[0].value.length <= 1024);
  assert.equal(D.buildPayload({ ...cfg, embed: false }, { name: "Sam", tool: "Saw" }, 0).content, "Congrats Sam on Saw");
});

test("outbox: consent, retries, revoked webhook", { skip: !url && "set TEST_DATABASE_URL" }, async (t) => {
  const { conn } = await import("../lib/db.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now();
  await S.saveTrainingCfg({ enabled: true });
  const user = async (mode) => (await c.query("INSERT INTO site_users (email, name, first_name, verified_at, discord_announce) VALUES ($1,'Sam Q','Sam', now(), $2) RETURNING id", [`dc${n}${Math.random()}@x.test`, mode])).rows[0].id;
  const hook = async (on = true) => D.saveDiscord({ webhook: HOOK, enabled: on });
  const calls = [], real = globalThis.fetch;
  let reply = () => new Response(null, { status: 204 });
  globalThis.fetch = async (u, o) => { calls.push({ u, body: JSON.parse(o.body) }); return reply(); };
  t.after(() => { globalThis.fetch = real; });
  const rows = async (cert) => (await c.query("SELECT * FROM outbox WHERE payload->>'certId' = $1", [String(cert)])).rows[0];
  const now = (cert) => c.query("UPDATE outbox SET next_at = now() WHERE payload->>'certId' = $1", [String(cert)]);
  const cert = () => n + Math.floor(Math.random() * 1e9);

  await c.query("DELETE FROM outbox WHERE kind = 'discord'");
  await hook();
  const out = await user(""), a = cert(); await D.queueAnnouncement(out, a, "Saw");
  assert.equal(await rows(a), undefined, "opted out: nothing queued");

  const opted = await user("first"), b = cert(); await D.queueAnnouncement(opted, b, "Saw"); await D.queueAnnouncement(opted, b, "Saw");
  assert.equal((await c.query("SELECT 1 FROM outbox WHERE payload->>'certId' = $1", [String(b)])).rowCount, 1, "one post per sign-off");
  await c.query("UPDATE site_users SET discord_announce = '' WHERE id = $1", [opted]); await now(b);
  await D.drainDiscord(); assert.equal(calls.length, 0, "withdrawn before the send"); assert.ok((await rows(b)).sent_at);

  await c.query("UPDATE site_users SET discord_announce = 'first' WHERE id = $1", [opted]);
  const d = cert(); await D.queueAnnouncement(opted, d, "Lathe"); await now(d);
  reply = () => new Response(null, { status: 500 }); await D.drainDiscord();
  assert.equal((await rows(d)).tries, 1); assert.equal((await rows(d)).sent_at, null);
  await c.query("UPDATE outbox SET next_at = now() WHERE payload->>'certId' = $1", [String(d)]);
  reply = () => new Response(null, { status: 429, headers: { "retry-after": "30" } }); await D.drainDiscord();
  assert.equal((await rows(d)).tries, 1, "429 doesn't use a try"); assert.ok(new Date((await rows(d)).next_at) > new Date(Date.now() + 20_000));
  await now(d); reply = () => new Response(null, { status: 204 }); await D.drainDiscord();
  assert.ok((await rows(d)).sent_at); assert.ok(calls.at(-1).body.embeds[0].description.includes("Sam"));

  const e = cert(); await D.queueAnnouncement(opted, e, "Mill"); await now(e);
  reply = () => new Response(null, { status: 404 }); await D.drainDiscord();
  assert.equal((await D.discordView()).enabled, false, "revoked: integration switches itself off");
  assert.ok(!JSON.stringify(await D.discordView()).includes("abcdefgh"), "the URL never comes back");
});
