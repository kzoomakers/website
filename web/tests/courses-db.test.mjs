// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm run test:db. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

test("course lifecycle: sections, lessons, save, move, publish, delete", { skip }, async () => {
  const k = await import("../lib/courses/courses.ts");
  const { id } = await k.createCourse("Table saw " + Date.now(), "t@x.test");
  let c = await k.getCourse(id);
  assert.equal(c.sections.length, 1);
  await assert.rejects(k.editCourse(id, { status: "published" }), /at least one lesson/);
  await k.addLesson(c.sections[0].id, "One"); await k.addLesson(c.sections[0].id, "Two");
  c = await k.getCourse(id);
  const [one, two] = c.sections[0].lessons;
  const r = await k.saveLesson(one.id, { blocks: [{ type: "text", html: "<p>hi<script>x</script></p>" }, { type: "video", url: "https://evil.com" }], completion: { rule: "video" } }, "t@x.test");
  assert.equal(r.dropped, 1); assert.ok(r.problems.some((p) => /video/.test(p)));
  await k.move("lesson", two.id, "up");
  assert.deepEqual((await k.getCourse(id)).sections[0].lessons.map((l) => l.title), ["Two", "One"]);
  await assert.rejects(k.deleteSection(c.sections[0].id), /lessons first/);
  await k.editCourse(id, { status: "published" });
  await k.deleteCourse(id);
  assert.equal((await k.listCourses()).some((x) => x.id === id), false);
  assert.equal((await k.listCourses(true)).some((x) => x.id === id), true);
});

test("member progress: sequential unlock, checklist, drafts hidden", { skip }, async () => {
  const k = await import("../lib/courses/courses.ts"), p = await import("../lib/courses/player.ts"), { conn } = await import("../lib/db.ts");
  const c = await conn(), n = Date.now();
  const uid = (await c.query("INSERT INTO site_users (email, name, verified_at, approval) VALUES ($1,'m', now(), 'approved') RETURNING id", [`m${n}@x.test`])).rows[0].id;
  const { id } = await k.createCourse("Player " + n, "t");
  let o = await k.getCourse(id);
  await k.addLesson(o.sections[0].id, "A"); await k.addLesson(o.sections[0].id, "B");
  const [a, b] = (await k.getCourse(id)).sections[0].lessons;
  await k.saveLesson(a.id, { blocks: [{ type: "checklist", id: "c1", items: ["x", "y"] }], completion: { rule: "checklist" } }, "t");
  const v = { id: uid, member: true, staff: false };
  assert.equal(await p.courseOutline(v, o.slug), null); // draft
  await k.editCourse(id, { status: "published" });
  assert.equal(await p.lessonFor(v, o.slug, b.id), null); // locked
  await assert.rejects(p.recordProgress(uid, b.id, { action: "view" }), /earlier lessons/);
  await p.recordProgress(uid, a.id, { action: "tick", block: "c1", idx: 0, on: true });
  assert.equal((await p.recordProgress(uid, a.id, { action: "tick", block: "c1", idx: 1, on: true })).state, "done");
  assert.ok(await p.lessonFor(v, o.slug, b.id));
  assert.equal((await p.courseOutline(v, o.slug)).next, b.id);
});

test("practice: only flagged questions, key revealed after answering, never touches attempts", { skip }, async () => {
  const pr = await import("../lib/courses/practice.ts"), { conn } = await import("../lib/db.ts"), c = await conn(), n = Date.now();
  const uid = (await c.query("INSERT INTO site_users (email, name, verified_at, approval) VALUES ($1,'p', now(), 'approved') RETURNING id", [`p${n}@x.test`])).rows[0].id;
  const tid = (await c.query("INSERT INTO tests (title) VALUES ('Quiz ' || $1) RETURNING id", [n])).rows[0].id; // no tool: standalone, all questions count
  const rev = (await c.query("INSERT INTO test_revisions (test_id, rev_no, status) VALUES ($1, 1, 'draft') RETURNING id", [tid])).rows[0].id;
  const cfg = { choices: ["Yes", "No"], correct: 0 };
  await c.query("INSERT INTO rev_questions (revision_id, position, type, prompt_html, config) VALUES ($1, 1, 'mc_single', '<p>Q1</p>', $2)", [rev, cfg]);
  await c.query("UPDATE test_revisions SET status = 'published', published_by = 't', published_at = now() WHERE id = $1", [rev]);
  const id = await pr.startPractice(uid, tid), v = await pr.practiceView(uid, id);
  assert.equal(v.done, false); assert.equal(JSON.stringify(v).includes("correct"), false); // no key before answering
  const a = await pr.practiceAnswer(uid, id, v.question.id, 1);
  assert.equal(a.correct, false);
  await assert.rejects(pr.practiceAnswer(uid, id, v.question.id, 0), /already/);
  assert.equal((await pr.practiceView(uid, id)).done, true);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM attempts WHERE user_id = $1", [uid])).rows[0].n, 0);
});

test("tool requirements: off by default, then block the real test until done", { skip }, async () => {
  const k = await import("../lib/courses/courses.ts"), tl = await import("../lib/courses/tools.ts"), { conn } = await import("../lib/db.ts"), { saveLearnFlags } = await import("../lib/learn-flags.ts"), c = await conn(), n = Date.now();
  await saveLearnFlags({ courses: true });
  const uid = (await c.query("INSERT INTO site_users (email, name, verified_at, approval) VALUES ($1,'r', now(), 'approved') RETURNING id", [`r${n}@x.test`])).rows[0].id;
  const tool = (await c.query("INSERT INTO tools (name) VALUES ('Saw ' || $1) RETURNING id", [n])).rows[0].id, v = { id: uid, member: true, staff: false };
  const { id } = await k.createCourse("Saw course " + n, "t"), o = await k.getCourse(id);
  await k.addLesson(o.sections[0].id, "A"); await k.editCourse(id, { status: "published" });
  await tl.setToolLearning(tool, { courseIds: [id], require_course: false });
  assert.equal((await tl.missingFor(v, [tool])).length, 0); // linked but not required
  await tl.setToolLearning(tool, { courseIds: [id], require_course: true });
  assert.equal((await tl.missingFor(v, [tool])).length, 1);
  const lesson = (await k.getCourse(id)).sections[0].lessons[0].id;
  await c.query("INSERT INTO lesson_progress (user_id, lesson_id, state) VALUES ($1, $2, 'done')", [uid, lesson]);
  assert.equal((await tl.missingFor(v, [tool])).length, 0);
});
