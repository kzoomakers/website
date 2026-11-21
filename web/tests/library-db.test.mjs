// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm run test:db. Skipped otherwise. No S3: rows are inserted directly.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const world = async () => {
  const { conn } = await import("../lib/db.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  const user = async (name, approval = "approved") => (await c.query("INSERT INTO site_users (email, name, verified_at, approval) VALUES ($1,$2, now(), $3) RETURNING id", [`${name}${n}@x.test`, name + n, approval])).rows[0].id;
  const doc = async (title, tier, o = {}) => {
    const d = (await c.query("INSERT INTO lib_docs (slug, title, tier, status, type) VALUES ($1,$2,$3,$4,$5) RETURNING id, slug", [`${title}-${n}`, `${title} ${n}`, tier, o.status ?? "published", o.type ?? "manual"])).rows[0];
    await c.query("INSERT INTO lib_versions (doc_id, version, s3_key, pages, has_text, text_extract) VALUES ($1, 1, $2, 3, true, $3)", [d.id, `lib/t${n}/${title}/v1.pdf`, o.text ?? ""]);
    await (await import("../lib/library/docs.ts")).reindex(d.id);
    return d;
  };
  return { c, n, user, doc };
};
const titles = (rows) => rows.map((r) => r.title.replace(/ \d+$/, "")).sort();

test("the library schema is created and can be created twice", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { librarySchema } = await import("../lib/library/schema.ts"), { coursesSchema } = await import("../lib/courses/schema.ts");
  const c = await conn();
  await librarySchema(c); await coursesSchema(c);
  for (const t of ["lib_docs", "lib_versions", "lib_shares", "lib_acks", "courses", "lessons"]) assert.equal((await c.query("SELECT to_regclass($1) AS r", [t])).rows[0].r, t);
});

test("each viewer sees only the tiers they qualify for, in lists, search and single lookups", { skip }, async () => {
  const { c, user, doc } = await world(), D = await import("../lib/library/docs.ts");
  const member = await user("m"), authed = await user("a");
  const pub = await doc("pub", "public", { text: "zebra" }), mem = await doc("mem", "members", { text: "zebra" }), au = await doc("au", "authorized", { text: "zebra" }), st = await doc("st", "staff", { text: "zebra" }), draft = await doc("dr", "public", { status: "draft", text: "zebra" });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", ["Saw" + Date.now()])).rows[0].id;
  await c.query("INSERT INTO tool_docs (tool_id, doc_id) VALUES ($1, $2)", [tool, au.id]);
  await c.query("INSERT INTO tool_auths (user_id, tool_id) VALUES ($1, $2)", [authed, tool]);
  const mine = async (v) => (await D.listDocs(v, { q: "zebra" })).filter((r) => [pub, mem, au, st, draft].some((x) => x.id === r.id));
  assert.deepEqual(titles(await mine({ id: null, member: false, staff: false })), ["pub"], "signed out: public and published only");
  assert.deepEqual(titles(await mine({ id: member, member: true, staff: false })), ["mem", "pub"]);
  assert.deepEqual(titles(await mine({ id: authed, member: true, staff: false })), ["au", "mem", "pub"], "authorized tier needs a tool authorization");
  assert.equal((await mine({ id: 0, member: false, staff: true })).length, 5, "staff see drafts and staff-only too");
  assert.equal(await D.getDoc({ id: member, member: true, staff: false }, st.slug), undefined, "single lookup obeys the same rule");
  await c.query("UPDATE tool_auths SET expires_on = current_date - 1 WHERE user_id = $1", [authed]);
  assert.equal((await mine({ id: authed, member: true, staff: false })).some((r) => r.id === au.id), false, "an expired authorization no longer opens it");
});

test("folders are three levels deep at most, and non-staff never see a folder with nothing for them", { skip }, async () => {
  const { c, user, doc, n } = await world(), F = await import("../lib/library/folders.ts");
  await F.createFolder(null, "L1 " + n);
  const l1 = (await c.query("SELECT id FROM lib_folders WHERE slug = $1 ORDER BY id DESC", [`l1-${n}`])).rows[0].id;
  await F.createFolder(l1, "L2"); const l2 = (await c.query("SELECT id FROM lib_folders WHERE parent_id = $1", [l1])).rows[0].id;
  await F.createFolder(l2, "L3");
  const l3 = (await c.query("SELECT id FROM lib_folders WHERE parent_id = $1", [l2])).rows[0].id;
  await assert.rejects(F.createFolder(l3, "L4"), /3 levels/);
  const secret = await doc("secret", "staff"); await F.placeDoc(secret.id, [l3]);
  const m = await user("fm");
  assert.equal((await F.listFolders({ id: m, member: true, staff: false })).some((f) => f.id === l1), false, "no hint of a staff-only document");
  assert.equal((await F.listFolders({ id: 0, member: true, staff: true })).some((f) => f.id === l1), true);
  await F.deleteFolder(l1);
  assert.equal((await c.query("SELECT 1 FROM lib_docs WHERE id = $1", [secret.id])).rowCount, 1, "the document outlives its folder");
});

test("share links: only live, matching tokens open; revoke and expiry stop them", { skip }, async () => {
  const { c, doc } = await world(), S = await import("../lib/library/shares.ts");
  const d = await doc("shared", "staff");
  const { token, passcode, days } = await S.createShare(d.id, { days: 7, allowDownload: false }, "t");
  assert.equal(days, 7);
  const s = await S.shareByToken(token);
  assert.ok(s); assert.equal(S.passcodeOk(s, passcode), true); assert.equal(S.passcodeOk(s, "nope"), false);
  assert.equal((await c.query("SELECT passcode_hash, token_hash FROM lib_shares WHERE id = $1", [s.id])).rows[0].token_hash.includes(token), false, "the raw token is never stored");
  await S.revokeShare(s.id);
  assert.equal(await S.shareByToken(token), null);
  const b = await S.createShare(d.id, {}, "t");
  await c.query("UPDATE lib_shares SET expires_at = now() - interval '1 minute' WHERE token_hash <> ''  AND doc_id = $1 AND revoked_at IS NULL", [d.id]);
  assert.equal(await S.shareByToken(b.token), null, "expired");
});

test("acknowledgements: a re-read version asks again, a minor one doesn't", { skip }, async () => {
  const { c, user, doc } = await world(), D = await import("../lib/library/docs.ts");
  const u = await user("ack"), other = await user("noack"), d = await doc("sop", "members", { type: "sop" });
  const v = { id: u, member: true, staff: false };
  await D.acknowledge(v, d.slug);
  let r = await D.ackReport(d.id);
  assert.ok(r.read.some((x) => x.name.startsWith("ack")) && r.unread.some((x) => x.startsWith("noack")));
  // v2, minor: earlier acknowledgement carries over
  await c.query("INSERT INTO lib_versions (doc_id, version, s3_key, requires_reread) VALUES ($1, 2, 'k2', false)", [d.id]);
  await c.query("UPDATE lib_docs SET current_version = 2 WHERE id = $1", [d.id]);
  r = await D.ackReport(d.id); assert.ok(r.read.some((x) => x.name.startsWith("ack")), "minor change keeps it");
  // v3, re-read required
  await c.query("INSERT INTO lib_versions (doc_id, version, s3_key, requires_reread) VALUES ($1, 3, 'k3', true)", [d.id]);
  await c.query("UPDATE lib_docs SET current_version = 3 WHERE id = $1", [d.id]);
  r = await D.ackReport(d.id); assert.equal(r.read.some((x) => x.name.startsWith("ack")), false, "must read again");
  await D.acknowledge(v, d.slug); await D.acknowledge(v, d.slug); // twice is harmless
  assert.equal((await c.query("SELECT count(*)::int AS n FROM lib_acks WHERE user_id = $1 AND doc_id = $2", [u, d.id])).rows[0].n, 2);
  const manual = await doc("man", "members", { type: "manual" });
  await assert.rejects(D.acknowledge(v, manual.slug), /doesn't need/);
  void other;
});

test("deleted documents leave every list; a 30-day-old one is purged", { skip }, async () => {
  const { c, doc } = await world(), D = await import("../lib/library/docs.ts");
  const d = await doc("gone", "members"), staff = { id: 0, member: true, staff: true };
  await D.deleteDoc(d.id);
  assert.equal((await D.listDocs(staff)).some((r) => r.id === d.id), false);
  assert.equal((await D.listDocs(staff, { trash: true })).some((r) => r.id === d.id), true, "in the recycle bin");
  await D.restoreDoc(d.id);
  assert.equal((await D.listDocs(staff)).some((r) => r.id === d.id), true);
  await D.deleteDoc(d.id);
  await c.query("UPDATE lib_docs SET deleted_at = now() - interval '31 days' WHERE id = $1", [d.id]);
  await D.purgeTrash();
  assert.equal((await c.query("SELECT 1 FROM lib_docs WHERE id = $1", [d.id])).rowCount, 0);
});
