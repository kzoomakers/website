// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm run test:db. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const text = (t = "Hello") => ({ type: "text", html: `<p>${t}</p>` });
const world = async () => {
  const k = await import("../lib/courses/courses.ts"), p = await import("../lib/courses/player.ts"), pr = await import("../lib/courses/practice.ts"), tl = await import("../lib/courses/tools.ts");
  const { conn } = await import("../lib/db.ts"), { saveLearnFlags } = await import("../lib/learn-flags.ts"), c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await saveLearnFlags({ courses: true, library: true });
  const user = async () => { const id = (await c.query("INSERT INTO site_users (email, name, verified_at, approval) VALUES ($1,'m', now(), 'approved') RETURNING id", [`m${n}x${Math.random()}@x.test`])).rows[0].id; return { id, v: { id, member: true, staff: false } }; };
  /** A published course whose lessons are given as [{ blocks, completion }]. */
  const course = async (lessons, publish = true) => {
    const { id } = await k.createCourse(`Course ${n} ${Math.random()}`, "t"), o = await k.getCourse(id);
    for (const [i] of lessons.entries()) await k.addLesson(o.sections[0].id, `L${i + 1}`);
    const ls = (await k.getCourse(id)).sections[0].lessons;
    for (const [i, l] of lessons.entries()) await k.saveLesson(ls[i].id, { blocks: l.blocks ?? [text()], completion: l.completion ?? { rule: "viewed" } }, "t");
    if (publish) await k.editCourse(id, { status: "published" });
    return { id, slug: o.slug, section: o.sections[0].id, lessons: ls.map((l) => l.id) };
  };
  return { k, p, pr, tl, c, n, user, course };
};

test("course lifecycle: save cleans blocks, move, publish, delete", { skip }, async () => {
  const { k, course } = await world();
  const x = await course([{}, {}], false);
  const r = await k.saveLesson(x.lessons[0], { blocks: [text("<script>"), { type: "video", url: "https://evil.com" }], completion: { rule: "viewed" } }, "t");
  assert.equal(r.dropped, 1);
  await k.move("lesson", x.lessons[1], "up");
  assert.deepEqual((await k.getCourse(x.id)).sections[0].lessons.map((l) => l.title), ["L2", "L1"]);
  assert.equal("blocks" in (await k.getCourse(x.id)).sections[0].lessons[0], false, "the outline carries no blocks");
  await k.editCourse(x.id, { status: "published" });
  await k.deleteCourse(x.id);
  assert.equal((await k.listCourses()).some((c) => c.id === x.id), false);
  assert.equal((await k.listCourses(true)).some((c) => c.id === x.id), true);
});

test("publishing is refused for an empty course and for a lesson nobody could finish", { skip }, async () => {
  const { k, course } = await world();
  const { id } = await k.createCourse("Empty " + Date.now(), "t");
  await assert.rejects(k.editCourse(id, { status: "published" }), /at least one lesson/);
  const x = await course([{ completion: { rule: "video" } }], false); // rule needs a video block that isn't there
  await assert.rejects(k.editCourse(x.id, { status: "published" }), /Fix these before publishing/);
  await k.saveLesson(x.lessons[0], { blocks: [{ type: "video", url: "https://youtu.be/dQw4w9WgXcQ" }], completion: { rule: "video" } }, "t");
  await k.editCourse(x.id, { status: "published" });
});

test("slugs never collide, even for the same title at the same moment", { skip }, async () => {
  const { k } = await world(), t = "Same title " + Date.now();
  const ids = await Promise.all([k.createCourse(t, "t"), k.createCourse(t, "t"), k.createCourse(t, "t")]);
  assert.equal(new Set(ids.map((x) => x.id)).size, 3);
  for (const { id } of ids) assert.equal((await k.getCourse(id)).sections.length, 1, "every course has its first section");
});

test("limits: sections, lesson size, revisions kept", { skip }, async () => {
  const { k, c, course } = await world();
  const x = await course([{}], false);
  await assert.rejects(k.saveLesson(x.lessons[0], { blocks: Array.from({ length: 30 }, () => ({ type: "text", html: "<p>" + "x".repeat(49_000) + "</p>" })) }, "t"), /too big/);
  const r = await k.saveLesson(x.lessons[0], { blocks: Array.from({ length: 105 }, (_, i) => text("b" + i)) }, "t");
  assert.equal(r.blocks.length, 100); assert.equal(r.dropped, 5, "blocks past the limit are reported, not silently lost");
  for (let i = 0; i < 25; i++) await k.saveLesson(x.lessons[0], { blocks: [text("v" + i)] }, "t");
  assert.ok((await c.query("SELECT count(*)::int AS n FROM lesson_revisions WHERE lesson_id = $1", [x.lessons[0]])).rows[0].n <= 20);
});

test("recycle bin: restore a lesson, deleting a section, purge after 30 days", { skip }, async () => {
  const { k, c, course } = await world();
  const x = await course([{}, {}], false);
  await k.deleteLesson(x.lessons[0]);
  assert.deepEqual((await k.getCourse(x.id)).trashed.map((l) => l.id), [x.lessons[0]]);
  await k.restoreLesson(x.lessons[0]);
  assert.equal((await k.getCourse(x.id)).trashed.length, 0);
  await assert.rejects(k.deleteSection(x.section), /lessons first/);
  await k.deleteLesson(x.lessons[1]);
  await c.query("UPDATE lessons SET deleted_at = now() - interval '31 days' WHERE id = $1", [x.lessons[1]]);
  await assert.rejects(k.restoreLesson(x.lessons[1]), /can't be restored/);
  await k.purgeLearning();
  assert.equal((await c.query("SELECT 1 FROM lessons WHERE id = $1", [x.lessons[1]])).rowCount, 0);
  await k.deleteCourse(x.id);
  await c.query("UPDATE courses SET deleted_at = now() - interval '31 days' WHERE id = $1", [x.id]);
  await k.purgeLearning();
  assert.equal((await c.query("SELECT 1 FROM courses WHERE id = $1", [x.id])).rowCount, 0);
});

test("member progress: drafts hidden, locked lessons refused, order enforced", { skip }, async () => {
  const { p, course, user } = await world(), u = await user();
  const x = await course([{}, {}], false);
  assert.equal(await p.courseOutline(u.v, x.slug), null, "a draft is invisible to members");
  const { k } = await world(); await k.editCourse(x.id, { status: "published" });
  assert.equal(await p.lessonFor(u.v, x.slug, x.lessons[1]), null, "locked");
  await assert.rejects(p.recordProgress(u.id, x.lessons[1], { action: "view" }), /earlier lessons/);
  assert.equal((await p.recordProgress(u.id, x.lessons[0], { action: "view" })).state, "done");
  const l = await p.lessonFor(u.v, x.slug, x.lessons[1]);
  assert.ok(l); assert.ok(l.lesson.blocks.length, "the opened lesson has its blocks");
  assert.equal((await p.courseOutline(u.v, x.slug)).next, x.lessons[1]);
  assert.ok(await p.courseOutline({ id: null, member: false, staff: true }, x.slug, true), "staff preview");
});

test("two checklist ticks sent at once are both kept", { skip }, async () => {
  const { p, course, user } = await world(), u = await user();
  const x = await course([{ blocks: [{ type: "checklist", id: "c1", items: ["a", "b", "c"] }], completion: { rule: "checklist" } }]);
  await Promise.all([0, 1, 2].map((idx) => p.recordProgress(u.id, x.lessons[0], { action: "tick", block: "c1", idx, on: true })));
  const l = await p.lessonFor(u.v, x.slug, x.lessons[0]);
  assert.deepEqual(l.data.ticks.c1, [0, 1, 2]); assert.equal(l.complete, true);
});

test("the real test waits for a required course, and starts once it is done", { skip }, async () => {
  const { c, n, tl, p, course, user } = await world(), u = await user();
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts");
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Saw ${n}`])).rows[0].id;
  const id = await T.createTest(tool, "", "t"), r = (await T.getTest(id)).revisions[0].id;
  await T.saveQuestion(r, (await T.getRevision(r)).rev.at, { type: "mc_single", prompt_html: "Guard on?", points: 1, required_correct: true, config: { choices: ["Yes", "No"], correct: 0 } });
  await T.publish(r, (await T.getRevision(r)).rev.at, {}, "t");
  const x = await course([{}]);
  await tl.setToolLearning(tool, { courseIds: [x.id], require_course: false });
  assert.ok((await A.start(u.id, id)).attemptId, "linked but not required: nothing changes");
  const u2 = await user();
  await tl.setToolLearning(tool, { courseIds: [x.id], require_course: true });
  await assert.rejects(A.start(u2.id, id), /Before the test/);
  await p.recordProgress(u2.id, x.lessons[0], { action: "view" });
  assert.ok((await A.start(u2.id, id)).attemptId);
});

test("require_ack: only documents the member can see, and only until acknowledged", { skip }, async () => {
  const { c, n, tl, user } = await world(), u = await user();
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Router ${n}`])).rows[0].id;
  const doc = async (tier) => (await c.query("INSERT INTO lib_docs (slug, title, type, tier, status) VALUES ($1, $2, 'sop', $3, 'published') RETURNING id", [`sop-${tier}-${n}`, `SOP ${tier}`, tier])).rows[0].id;
  const open = await doc("members"), hidden = await doc("authorized");
  await tl.setToolLearning(tool, { docs: [{ id: open, role: "sop" }, { id: hidden, role: "sop" }], require_ack: true });
  assert.deepEqual((await tl.missingFor(u.v, [tool])).map((x) => x.title), ['Read and confirm "SOP members"'], "an authorized-tier SOP can't be required of someone not yet authorized");
  await c.query("INSERT INTO lib_acks (user_id, doc_id, version) VALUES ($1, $2, 1)", [u.id, open]);
  assert.equal((await tl.missingFor(u.v, [tool])).length, 0);
});

test("course authors see only member-visible document titles unless they also have library access", { skip }, async () => {
  const { k, c, n } = await world();
  await c.query("INSERT INTO lib_docs (slug, title, tier, status) VALUES ($1, $2, 'staff', 'published')", [`secret-${n}`, `Secret ${n}`]);
  assert.equal((await k.docChoices(false)).some((d) => d.title === `Secret ${n}`), false);
  assert.equal((await k.docChoices(true)).some((d) => d.title === `Secret ${n}`), true);
});

test("practice: flagged questions only, key revealed after answering, never touches attempts", { skip }, async () => {
  const { pr, c, n, user } = await world(), u = await user();
  const tid = (await c.query("INSERT INTO tests (title) VALUES ('Quiz ' || $1) RETURNING id", [n])).rows[0].id; // no tool: standalone, all questions count
  const rev = (await c.query("INSERT INTO test_revisions (test_id, rev_no, status) VALUES ($1, 1, 'draft') RETURNING id", [tid])).rows[0].id;
  await c.query("INSERT INTO rev_questions (revision_id, position, type, prompt_html, config) VALUES ($1, 1, 'mc_single', '<p>Q1</p>', $2)", [rev, { choices: ["Yes", "No"], correct: 0 }]);
  await c.query("UPDATE test_revisions SET status = 'published', published_by = 't', published_at = now() WHERE id = $1", [rev]);
  assert.equal((await pr.practiceTitles([tid]))[tid], `Quiz ${n}`);
  const id = await pr.startPractice(u.id, tid), v = await pr.practiceView(u.id, id);
  assert.equal(v.done, false); assert.equal(JSON.stringify(v.question).includes("correct"), false);
  const a = await pr.practiceAnswer(u.id, id, v.question.id, 1);
  assert.equal(a.correct, false);
  await assert.rejects(pr.practiceAnswer(u.id, id, v.question.id, 0), /already/);
  assert.equal((await pr.practiceView(u.id, id)).done, true);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM attempts WHERE user_id = $1", [u.id])).rows[0].n, 0);
  await c.query("UPDATE practice_attempts SET started_at = now() - interval '13 months' WHERE id = $1", [id]);
  await (await import("../lib/courses/courses.ts")).purgeLearning();
  assert.equal((await c.query("SELECT 1 FROM practice_attempts WHERE id = $1", [id])).rowCount, 0);
});
