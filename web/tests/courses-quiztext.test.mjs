import test from "node:test";
import assert from "node:assert/strict";
import { parseQuestions, formatQuestions } from "../lib/courses/quiztext.ts";

const sample = `Which guard stops kickback?
A. Riving knife
B. Fence
ANSWER: A
FEEDBACK: It keeps the kerf open.
TAGS: table saw, kickback

Pick the PPE.
A) Glasses
B) Gloves
C) Earplugs
ANSWER: A, C

The blade should be sharp.
ANSWER: True`;

test("parses single, multi and true/false", () => {
  const { questions: q, errors } = parseQuestions(sample);
  assert.deepEqual(errors, []);
  assert.deepEqual(q.map((x) => x.type), ["mc_single", "mc_multi", "true_false"]);
  assert.equal(q[0].correct, 0); assert.deepEqual(q[0].tags, ["table saw", "kickback"]); assert.equal(q[0].feedback, "It keeps the kerf open.");
  assert.deepEqual(q[1].correct, [0, 2]); assert.equal(q[2].correct, true);
});

test("errors name the question and nothing is guessed", () => {
  assert.match(parseQuestions("What?\nA. x\nB. y").errors[0], /Question 1.*ANSWER/);
  assert.match(parseQuestions("What?\nA. x\nB. y\nANSWER: C").errors[0], /A to B/);
  assert.match(parseQuestions("What?\nANSWER: maybe").errors[0], /True or False/);
  assert.match(parseQuestions("What?\nA. only\nANSWER: A").errors[0], /2 to 12/);
  assert.equal(parseQuestions("").questions.length, 0);
});

test("format round-trips and skips other types", () => {
  const { questions } = parseQuestions(sample);
  const qs = questions.map((x) => ({ type: x.type, prompt: x.prompt, feedback: x.feedback, tags: x.tags, config: x.type === "true_false" ? { correct: x.correct } : { choices: x.choices, correct: x.correct } }));
  const { text, skipped } = formatQuestions([...qs, { type: "match", prompt: "m", config: {}, feedback: "", tags: [] }]);
  assert.equal(skipped, 1);
  assert.deepEqual(parseQuestions(text).questions, questions);
});
