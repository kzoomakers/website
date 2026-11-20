// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("tag and category admin: admins only, validated, logged in the public mod log", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { saveTag, saveCategory, tagsIndex, getTagAdmin } = await import("../feed/models/tag-admin.ts");
  const c = await conn(), n = Date.now().toString(36).slice(-8);
  const mk = async (name, admin) => (await c.query(`INSERT INTO feed.users (username, email, token, is_admin, is_moderator) VALUES ($1, $2, $3, $4, $4) RETURNING id`, [name + n, `${name}${n}@example.org`, `u${name}${n}`, admin])).rows[0];
  const [adm, mod] = [await mk("adm", true), await mk("mod", false)];
  const cat = "Cat" + n, tag = "tg" + n;
  const input = (o = {}) => ({ tag, category: cat, description: "A tag", quorum: "2", hotness_mod: "0", permit_by_new_users: true, privileged: false, is_media: false, active: true, ...o });
  const logs = (col, id) => c.query(`SELECT action, moderator_user_id FROM feed.moderations WHERE ${col} = $1 ORDER BY id`, [id]).then((r) => r.rows);

  assert.ok(!(await saveCategory(mod.id, null, cat)).ok, "a moderator who isn't an admin can't");
  assert.equal((await saveCategory(adm.id, null, "bad name!")).ok, false);
  assert.ok((await saveCategory(adm.id, null, cat)).ok);
  assert.ok(!(await saveCategory(adm.id, null, cat.toUpperCase())).ok, "unique ignoring case");
  const catId = (await c.query("SELECT id FROM feed.categories WHERE category = $1", [cat])).rows[0].id;
  assert.match((await logs("category_id", catId))[0].action, /^Created new category with id '\d+', with category 'Cat/);

  assert.ok(!(await saveTag(mod.id, null, input())).ok);
  for (const [o, why] of [[{ tag: "" }, /blank/], [{ tag: "x".repeat(26) }, /too long/], [{ tag: "a b" }, /invalid/], [{ description: "d".repeat(101) }, /Description/], [{ hotness_mod: "11" }, /Hotness/], [{ hotness_mod: "" }, /Hotness/], [{ quorum: "1.5" }, /Quorum/], [{ category: "NoSuchCat" }, /Category/]])
    assert.match((await saveTag(adm.id, null, input(o))).error, why);
  assert.equal((await tagsIndex()).flatMap((x) => x.tags).filter((t) => t.tag === tag).length, 0, "nothing was created by the refusals");

  assert.ok((await saveTag(adm.id, null, input({ hotness_mod: "0.25" }))).ok);
  assert.ok(!(await saveTag(adm.id, null, input({ tag: tag.toUpperCase() }))).ok, "unique ignoring case");
  const t = await getTagAdmin(tag), id = (await c.query("SELECT id FROM feed.tags WHERE tag = $1", [tag])).rows[0].id;
  assert.deepEqual([t.category, t.hotness_mod, t.quorum, t.active], [cat, 0.25, 2, true]);
  assert.match((await logs("tag_id", id))[0].action, /^Created new tag with id '\d+', with tag '/);

  assert.ok((await saveTag(adm.id, tag, input({ description: "New words", active: false }))).ok);
  assert.ok((await saveTag(adm.id, tag, input({ description: "New words", active: false }))).ok, "saving again changes nothing");
  const l = await logs("tag_id", id);
  assert.equal(l.length, 2, "an unchanged save isn't logged");
  assert.equal(l[1].action, `Updating tag ${tag}, changed description from 'A tag' to 'New words', changed active from 'true' to 'false', changed hotness_mod from '0.25' to '0'`);
  assert.equal(l[1].moderator_user_id, adm.id);

  assert.ok((await saveTag(adm.id, tag, input({ tag: tag + "r", description: "New words", active: false }))).ok, "rename");
  assert.ok((await saveCategory(adm.id, cat, cat + "r")).ok);
  const idx = (await tagsIndex()).find((x) => x.category === cat + "r");
  assert.deepEqual(idx.tags.map((x) => [x.tag, x.active]), [[tag + "r", false]]);
  assert.ok(!(await saveTag(adm.id, "nosuch" + n, input({ tag: "q" + n }))).ok);
});
