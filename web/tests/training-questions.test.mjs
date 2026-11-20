import { test } from "node:test";
import assert from "node:assert/strict";

const Q = await import("../lib/training/questions.ts");
const D = await import("../lib/training/diff.ts");
const { TYPES, cleanQuestion, gradeQ, memberQuestion, problems } = Q;

const mk = (type, config, o = {}) => cleanQuestion({ type, prompt_html: "Question?", points: 1, config, ...o });
const SAMPLES = {
  mc_single: [mk("mc_single", { choices: ["a", "b", "c"], correct: 1 }), 1, 0],
  mc_multi: [mk("mc_multi", { choices: ["a", "b", "c", "d"], correct: [0, 2] }), [0, 2], [0]],
  true_false: [mk("true_false", { correct: false }), false, true],
  image_label: [mk("image_label", { image: "/uploads/training/x.webp", alt: "saw", zones: [{ id: "z1", x: 1, y: 1, w: 10, h: 10 }, { id: "z2", x: 20, y: 20, w: 10, h: 10 }], labels: [{ id: "l1", text: "Blade" }, { id: "l2", text: "Fence" }, { id: "l3", text: "Decoy" }], key: { z1: "l1", z2: "l2" } }), { z1: "l1", z2: "l2" }, { z1: "l2", z2: "l1" }],
  match: [mk("match", { left: [{ id: "a", text: "Red" }, { id: "b", text: "Green" }], right: [{ id: "x", text: "Stop" }, { id: "y", text: "Go" }], key: { a: "x", b: "y" } }), { a: "x", b: "y" }, { a: "y", b: "x" }],
  order: [mk("order", { items: [{ id: "1", text: "Unplug" }, { id: "2", text: "Wait" }, { id: "3", text: "Open" }] }), ["1", "2", "3"], ["3", "2", "1"]],
  fill_blank: [mk("fill_blank", { text: "Wear {{1}} and {{2}}.", slots: [{ choices: ["goggles", "gloves"], correct: 0 }, { choices: ["boots", "sandals"], correct: 0 }] }), [0, 0], [1, 1]],
  short_text: [mk("short_text", { accepted: ["Push stick"], regex: "" }), "  push   STICK ", "hand"],
  numeric: [mk("numeric", { value: 3.2, tolerance: 0.1, unit: "mm" }), "3,25", "4"],
  hotspot: [mk("hotspot", { image: "/uploads/training/x.webp", alt: "panel", regions: [{ x: 10, y: 10, w: 20, h: 20 }] }), { x: 15, y: 25 }, { x: 50, y: 50 }],
};

test("every type grades a right answer 1 and a wrong answer below 1", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), [...TYPES].sort(), "a sample for every type");
  for (const [t, [q, right, wrong]] of Object.entries(SAMPLES)) { assert.equal(gradeQ(q, right), 1, t); assert.ok(gradeQ(q, wrong) < 1, t); assert.deepEqual(problems(q), [], t); }
});

test("malformed answers score 0 and never throw", () => {
  for (const [t, [q]] of Object.entries(SAMPLES)) for (const bad of [undefined, null, 5, "x", [], {}, [null], { z1: {} }, { x: "a", y: [] }, "9".repeat(10_000)]) assert.doesNotThrow(() => gradeQ(q, bad), t);
  const half = mk("numeric", { value: 0.5, tolerance: 0 });
  assert.deepEqual(["0.5", ".5", "0,5", "5", "0.", "abc", "1e0"].map((a) => gradeQ(half, a)), [1, 1, 1, 0, 0, 0, 0], "a leading dot is a number; 0. is not");
  assert.equal(gradeQ(SAMPLES.order[0], ["1", "1", "1"]), 0, "not a permutation");
  assert.equal(gradeQ(SAMPLES.order[0], ["1", "2"]), 0);
});

test("partial credit", () => {
  assert.equal(gradeQ(SAMPLES.image_label[0], { z1: "l1", z2: "l3" }), 0.5);
  assert.equal(gradeQ(SAMPLES.order[0], ["1", "3", "2"]), 1 / 3);
  const p = mk("mc_multi", { choices: ["a", "b", "c"], correct: [0, 1], scoring: "partial" });
  assert.equal(gradeQ(p, [0]), 0.5); assert.equal(gradeQ(p, [0, 2]), 0, "a wrong pick cancels a right one"); assert.equal(gradeQ(p, [2]), 0, "never negative");
  assert.equal(gradeQ(SAMPLES.mc_multi[0], [0]), 0, "all-or-nothing is the default");
});

test("members never get the key: no answer-bearing field in any member view", () => {
  const FORBIDDEN = new Set(["correct", "key", "accepted", "regex", "value", "tolerance", "regions", "feedback_html", "config", "scoring_key"]);
  const scan = (v, path) => { if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { assert.ok(!FORBIDDEN.has(k), `${path}.${k} leaks the key`); scan(x, `${path}.${k}`); } };
  for (const [t, [q]] of Object.entries(SAMPLES)) { const m = memberQuestion({ ...q, id: 7, qkey: "k" }, 123); scan(m, t); assert.equal(m.id, 7); assert.ok(!JSON.stringify(m).includes("Decoy") || t === "image_label", t); }
  const m = memberQuestion({ ...SAMPLES.mc_single[0], id: 1 }, 5);
  assert.ok(m.view.choices.every((c) => "i" in c && "text" in c), "a choice is sent as {i, text}, answered by i");
});

test("shuffles follow the seed: same seed same order, other seed other order; order questions never arrive already solved", () => {
  const q = { ...mk("mc_single", { choices: Array.from({ length: 10 }, (_, i) => "c" + i), correct: 0 }), id: 1, qkey: "k1" };
  const o = (s) => memberQuestion(q, s).view.choices.map((c) => c.i).join();
  assert.equal(o(1), o(1)); assert.notEqual(o(1), o(2));
  assert.equal(memberQuestion(q, 1, false).view.choices.map((c) => c.i).join(), "0,1,2,3,4,5,6,7,8,9");
  const ord = { ...SAMPLES.order[0], id: 2, qkey: "k2" };
  for (let s = 0; s < 40; s++) assert.notDeepEqual(memberQuestion(ord, s).view.items.map((x) => x.id), ["1", "2", "3"]);
});

test("cleaning bounds and repairs input", () => {
  const q = cleanQuestion({ type: "nope", prompt_html: "<script>x</script><p>Hi</p>", points: 9999, config: { choices: Array(50).fill("x".repeat(999)), correct: 99 } });
  assert.equal(q.type, "mc_single"); assert.equal(q.points, 100); assert.ok(!q.prompt_html.includes("script")); assert.equal(q.config.choices.length, 12); assert.equal(q.config.choices[0].length, 300); assert.equal(q.config.correct, -1);
  const z = cleanQuestion({ type: "image_label", config: { image: "https://evil.example/x.png", zones: [{ id: "z", x: -5, y: 500, w: 10, h: 10 }], labels: [{ id: "l", text: "A" }], key: { z: "l", ghost: "l", z2: "nope" } } });
  assert.equal(z.config.image, "", "only our own /uploads images"); assert.deepEqual([z.config.zones[0].x, z.config.zones[0].y], [0, 100]); assert.deepEqual(z.config.key, { z: "l" });
  assert.equal(cleanQuestion({ type: "hotspot", config: { image: "/uploads/../etc/passwd" } }).config.image, "");
});

test("publish problems are reported per question", () => {
  assert.ok(problems(mk("mc_single", { choices: ["a", ""], correct: 0 })).length);
  assert.ok(problems(mk("mc_single", { choices: ["a", "A"], correct: 0 })).some((p) => /same/.test(p)));
  assert.ok(problems(mk("image_label", { image: "/uploads/a.webp", alt: "x", zones: [{ id: "z", x: 1, y: 1, w: 5, h: 5 }], labels: [{ id: "l", text: "A" }], key: {} })).some((p) => /correct name/.test(p)));
  assert.ok(problems(mk("fill_blank", { text: "no blanks", slots: [] })).length);
  assert.ok(problems(mk("short_text", { accepted: [""], regex: "(a+)+" })).some((p) => /complex/.test(p)));
  assert.ok(problems(cleanQuestion({ type: "true_false", prompt_html: "  ", config: {} })).some((p) => /Write the question/.test(p)));
});

const rev = (qs, s = {}) => ({ settings: { pass_pct: 80, review_mode: "missed", ...s }, questions: qs.map(([qkey, q]) => ({ ...q, qkey })) });
test("diff: a typo is minor; a changed answer, a new question, or a new pass mark is major; hash catches any change", () => {
  const a = rev([["k1", mk("mc_single", { choices: ["Yes", "No"], correct: 0 })], ["k2", mk("true_false", { correct: true })]]);
  const typo = rev([["k1", { ...a.questions[0], prompt_html: "Question??" }], ["k2", a.questions[1]]]);
  assert.deepEqual([D.diffRevisions(a, typo).suggest, D.diffRevisions(a, typo).changed.map((c) => c.fields)], ["minor", [["wording"]]]);
  const key = rev([["k1", mk("mc_single", { choices: ["Yes", "No"], correct: 1 })], ["k2", a.questions[1]]]);
  assert.equal(D.diffRevisions(a, key).suggest, "major"); assert.ok(D.diffRevisions(a, key).changed[0].keyChanged);
  assert.equal(D.diffRevisions(a, rev([["k1", a.questions[0]]])).suggest, "major"); assert.deepEqual(D.diffRevisions(a, rev([["k1", a.questions[0]]])).removed, ["k2"]);
  assert.equal(D.diffRevisions(a, rev(a.questions.map((q) => [q.qkey, q]), { pass_pct: 90 })).suggest, "major");
  assert.equal(D.diffRevisions(a, rev(a.questions.map((q) => [q.qkey, q]), { review_mode: "all" })).suggest, "minor");
  assert.equal(D.diffRevisions(a, a).moved, false); assert.equal(D.diffRevisions(a, rev([["k2", a.questions[1]], ["k1", a.questions[0]]])).moved, true);
  assert.equal(D.revisionHash(a), D.revisionHash(rev(a.questions.map((q) => [q.qkey, q])))); assert.notEqual(D.revisionHash(a), D.revisionHash(typo));
});

test("drawQuestions: same seed same draw, pool limits it, no shuffle keeps the author's order", async () => {
  const { drawQuestions } = await import("../lib/training/questions.ts");
  const qs = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
  assert.deepEqual(drawQuestions(qs, 7, 4, true), drawQuestions(qs, 7, 4, true));
  assert.equal(drawQuestions(qs, 7, 4, true).length, 4);
  const plain = drawQuestions(qs, 7, 4, false).map((q) => q.id);
  assert.deepEqual(plain, [...plain].sort((a, b) => a - b));
  assert.equal(drawQuestions(qs, 7, null, false).length, 10);
});
