// Phase 8 security hardening suite: answer-key exposure, IDOR, separation of duties, ReDoS, XSS, prototype guards,
// rate limits, webhook/HTTP-log redaction, audit trail, and privacy retention/erasure.
// Unit tests always run; DB-backed tests run when TEST_DATABASE_URL is set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
process.env.CONFIG_PATH = "/nonexistent";
process.env.PII_CRYPTO_SECRET ||= "test-secret";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const { toRow } = await import("../lib/httplog.ts");
const { redact, scrubText, MASK } = await import("../lib/redact.ts");
const { cleanQuestion, gradeQ, problems } = await import("../lib/training/questions.ts");
const { cleanHtml } = await import("../lib/sanitize.ts");

// ---- Unit checks (always run) ---------------------------------------------------------------------------------------------------------

test("webhook and secret redaction in HTTP logs (toRow) and debug redactor (redact/scrubText)", () => {
  const SECRET = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  const HOOK = `https://discord.com/api/webhooks/123456789012345678/${SECRET}`;
  const row = toRow({
    url: `https://kzoomakers.org/api/webhooks/123456789012345678/${SECRET}?token=tok1&webhook=${encodeURIComponent(HOOK)}&next=${encodeURIComponent(HOOK)}&page=2`,
    method: "POST",
    headers: new Headers({ referer: HOOK, "user-agent": "test", "fly-client-ip": "203.0.113.5" }),
  });
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes(SECRET), "webhook token must never appear in httplog row");
  assert.ok(!dump.includes("tok1"), "token query param must be redacted");
  assert.equal(row.params.webhook, "[redacted]");
  assert.equal(row.params.token, "[redacted]");
  assert.equal(row.params.page, "2");
  assert.ok(row.referer.includes("[redacted]"), "webhook token in referer must be redacted");
  assert.ok(row.path.includes("[redacted]"), "webhook token in path must be redacted");

  assert.ok(!scrubText(`POST ${HOOK} failed`).includes(SECRET), "scrubText masks Discord webhook tokens");
  const red = redact({ webhook: HOOK, ok: "yes" });
  assert.equal(red.webhook, MASK);
  assert.equal(red.ok, "yes");
});

test("short_text regex ReDoS protection: dangerous patterns rejected on publish and timed out on grade", () => {
  for (const evil of ["(a+)+$", "(a|a)+$", "([a-z]{1,9})+$"]) {
    const q = cleanQuestion({ type: "short_text", prompt_html: "Name?", config: { accepted: [], regex: evil } });
    assert.ok(problems(q).some((p) => /complex|valid/.test(p)), `expected ${evil} to be rejected`);
  }
  // Even an unpublished draft (not yet validated) cannot hang the event loop during previewGrade/gradeQ.
  const draft = cleanQuestion({ type: "short_text", prompt_html: "Name?", config: { accepted: [], regex: "(a|a)+$" } });
  const t0 = Date.now();
  assert.equal(gradeQ(draft, "a".repeat(35) + "!"), 0);
  assert.ok(Date.now() - t0 < 500, "catastrophic regex must abort under timeout");
  const ok = cleanQuestion({ type: "short_text", prompt_html: "Name?", config: { accepted: [], regex: "^push\\s+stick$" } });
  assert.deepEqual(problems(ok), []);
  assert.equal(gradeQ(ok, "Push  stick"), 1);
  assert.equal(gradeQ(ok, "hand"), 0);
});

test("XSS and answer-key static guards on training UI and API routes", () => {
  const fileTsx = readFileSync("app/admin/people/training/cert/[id]/file.tsx", "utf8");
  assert.ok(!fileTsx.includes("dangerouslySetInnerHTML"), "cert file must render prompt_html through <Rich>, never raw dangerouslySetInnerHTML");
  assert.ok(fileTsx.includes("<Rich"), "cert file uses <Rich>");
  assert.ok(!cleanHtml("<p>Safe</p><script>alert(1)</script><img src=x onerror=alert(1)>").includes("onerror"));

  const formsTsx = readFileSync("app/admin/people/training/tests/[id]/forms.tsx", "utf8");
  assert.ok(!/["']l["']\s*\+\s*i/.test(formsTsx) && !/["']r["']\s*\+\s*i/.test(formsTsx), "match builder must not emit correlated l0/r0/d0 IDs");

  const memberApi = readFileSync("app/api/training/route.ts", "utf8");
  assert.ok(!memberApi.includes(".split(\",\")[0]"), "member API must not trust spoofable leftmost x-forwarded-for");
  for (const op of ["start", "save", "submit", "result"]) assert.ok(new RegExp(`\\b${op}\\s*:`).test(memberApi), `member API rate-limits ${op}`);

  const adminApi = readFileSync("app/api/webmaster/training/route.ts", "utf8");
  assert.ok(adminApi.includes("Object.hasOwn(PAGE") && adminApi.includes("Object.hasOwn(REPORTS"), "admin RPC guards prototype lookups");
  assert.ok(adminApi.includes("train-export:") && adminApi.includes("train-discord-test:"), "admin RPC rate-limits exports and Discord test posts");

  const announceApi = readFileSync("app/api/members/training/announce/route.ts", "utf8");
  assert.ok(announceApi.includes("currentMember") && announceApi.includes("hit("), "announce endpoint checks member auth and rate limit");
});

// ---- DB-backed security checks --------------------------------------------------------------------------------------------------------

const ALL_QUESTIONS = [
  { type: "mc_single", prompt_html: "MC1?", points: 1, feedback_html: "SECRET_FB_1", config: { choices: ["ChoiceA", "ChoiceB"], correct: 1 } },
  { type: "mc_multi", prompt_html: "MC2?", points: 1, feedback_html: "SECRET_FB_2", config: { choices: ["M1", "M2", "M3"], correct: [0, 2], scoring: "all" } },
  { type: "true_false", prompt_html: "TF?", points: 1, feedback_html: "SECRET_FB_3", config: { correct: false } },
  { type: "image_label", prompt_html: "IL?", points: 1, feedback_html: "SECRET_FB_4", config: { image: "/uploads/training/x.webp", alt: "saw", zones: [{ id: "za1", x: 1, y: 1, w: 20, h: 20 }], labels: [{ id: "lb9", text: "Guard" }, { id: "lb2", text: "Fence" }], key: { za1: "lb9" } } },
  { type: "match", prompt_html: "Match?", points: 1, feedback_html: "SECRET_FB_5", config: { left: [{ id: "x7a", text: "Red" }, { id: "k2q", text: "Green" }], right: [{ id: "p9z", text: "Stop" }, { id: "m4w", text: "Go" }], key: { x7a: "p9z", k2q: "m4w" } } },
  { type: "order", prompt_html: "Order?", points: 1, feedback_html: "SECRET_FB_6", config: { items: [{ id: "u8a", text: "Unplug" }, { id: "c3b", text: "Wait" }, { id: "n5c", text: "Open" }] } },
  { type: "fill_blank", prompt_html: "FB?", points: 1, feedback_html: "SECRET_FB_7", config: { text: "Wear {{1}}.", slots: [{ choices: ["goggles", "sandals"], correct: 0 }] } },
  { type: "short_text", prompt_html: "ST?", points: 1, feedback_html: "SECRET_FB_8", config: { accepted: ["SECRET_SHORT_ANS"], regex: "^SECRET_REGEX_9$" } },
  { type: "numeric", prompt_html: "Num?", points: 1, feedback_html: "SECRET_FB_9", config: { value: 42.195, tolerance: 0.05, unit: "mm" } },
  { type: "hotspot", prompt_html: "Hot?", points: 1, feedback_html: "SECRET_FB_10", config: { image: "/uploads/training/x.webp", alt: "panel", regions: [{ x: 17, y: 23, w: 11, h: 13 }] } },
];
const SENTINELS = ["SECRET_SHORT_ANS", "SECRET_REGEX_9", "SECRET_FB_1", "SECRET_FB_8", "42.195", "0.05"];
const FORBIDDEN_KEYS_ALWAYS = new Set(["key", "accepted", "regex", "value", "tolerance", "regions", "config"]);
const FORBIDDEN_KEYS_OPEN = new Set([...FORBIDDEN_KEYS_ALWAYS, "correct", "feedback_html", "answer"]);

function assertNoKeys(obj, forbidden, label) {
  const walk = (v, p) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { assert.ok(!forbidden.has(k), `${label}: leaked key field ${p}.${k}`); walk(x, `${p}.${k}`); }
  };
  walk(obj, label);
}

test("answer-key exposure: member endpoints never leak keys across all 10 question types and review modes", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true });

  for (const mode of ["score", "missed", "all"]) {
    const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`KeyTool-${mode}-${n}`])).rows[0].id;
    const user = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'M', now()) RETURNING id", [`key-${mode}-${n}@x.test`])).rows[0].id;
    const testId = await T.createTest(tool, "", "author"), revId = (await T.getTest(testId)).revisions[0].id;
    for (const q of ALL_QUESTIONS) await T.saveQuestion(revId, (await T.getRevision(revId)).rev.at, q);
    await T.saveSettings(revId, (await T.getRevision(revId)).rev.at, { review_mode: mode, pass_pct: 80 });
    await T.publish(revId, (await T.getRevision(revId)).rev.at, {}, "author");

    const ov1 = await A.overview(user);
    assertNoKeys(ov1, FORBIDDEN_KEYS_OPEN, `overview:${mode}`);
    const started = await A.start(user, testId);
    assert.equal(started.questions.length, ALL_QUESTIONS.length);
    assertNoKeys(started, FORBIDDEN_KEYS_OPEN, `start:${mode}`);
    const startJson = JSON.stringify(started);
    for (const s of SENTINELS) assert.ok(!startJson.includes(s), `start:${mode} leaked sentinel ${s}`);

    const saved = await A.save(user, started.attemptId, { [started.questions[0].id]: 0 }, 1);
    assertNoKeys(saved, FORBIDDEN_KEYS_OPEN, `save:${mode}`);

    // Submit wrong answers so every question is missed.
    const submitted = await A.submit(user, started.attemptId, {});
    const fetched = await A.result(user, started.attemptId);
    assertNoKeys(submitted, FORBIDDEN_KEYS_ALWAYS, `submit:${mode}`);
    assertNoKeys(fetched, FORBIDDEN_KEYS_ALWAYS, `result:${mode}`);
    if (mode !== "all") {
      assertNoKeys(submitted, new Set([...FORBIDDEN_KEYS_ALWAYS, "answer", "feedback_html"]), `submit-no-ans:${mode}`);
      for (const s of SENTINELS) assert.ok(!JSON.stringify(fetched).includes(s), `result:${mode} leaked sentinel ${s}`);
    } else {
      assert.equal(fetched.questions.length, ALL_QUESTIONS.length);
      for (const q of fetched.questions) assert.equal(typeof q.answer, "string", "review_mode=all only returns describeQ string, never raw config");
    }
    if (mode === "score") assert.equal(fetched.questions, undefined, "review_mode=score omits question list");
    const ov2 = await A.overview(user);
    assertNoKeys(ov2, FORBIDDEN_KEYS_OPEN, `overview-after:${mode}`);
  }
});

test("IDOR & separation of duties: attempts, certs, notes, overrides, rollout memberOverride, prototype bypass", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), K = await import("../lib/training/certs.ts");
  const O = await import("../lib/training/overrides.ts"), R = await import("../lib/training/recert.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true });

  const mkUser = async (tag) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id", [`${tag}-${n}@x.test`, tag])).rows[0].id;
  const toolA = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`ToolA-${n}`])).rows[0].id;
  const toolB = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`ToolB-${n}`])).rows[0].id;
  const memberA = await mkUser("memA"), memberB = await mkUser("memB"), trainerA = await mkUser("trA"), lead = await mkUser("lead");
  await K.setTrainer(toolA, trainerA, true, "admin");
  const as = (id, all = false) => ({ id, email: `u${id}-${n}@x.test`, all, view: all });

  // Build & publish a test for toolA
  const testId = await T.createTest(toolA, "Original", "admin"), revId = (await T.getTest(testId)).revisions[0].id;
  const q1 = await T.saveQuestion(revId, (await T.getRevision(revId)).rev.at, { type: "true_false", prompt_html: "Safe?", points: 1, config: { correct: true } });
  await T.publish(revId, (await T.getRevision(revId)).rev.at, {}, "admin");

  // 1. Attempt IDOR: memberB cannot save, submit, or read memberA's attempt.
  const att = await A.start(memberA, testId);
  await assert.rejects(A.save(memberB, att.attemptId, { [q1.id]: true }, 1), /not found/);
  await assert.rejects(A.submit(memberB, att.attemptId, { [q1.id]: true }), /not found/);
  await A.submit(memberA, att.attemptId, { [q1.id]: true });
  await assert.rejects(A.result(memberB, att.attemptId), /not found/);
  assert.equal((await A.overview(memberB)).history.some((h) => h.id === att.attemptId), false, "overview never leaks another member's attempt");

  // 2. Cert & Note IDOR: trainerA (assigned only to toolA) cannot open/mutate a cert on toolB.
  const certB = (await c.query("INSERT INTO certifications (user_id, tool_id, state) VALUES ($1,$2,'passed') RETURNING id", [memberA, toolB])).rows[0].id;
  await assert.rejects(K.file(as(trainerA), certB), /not found/);
  await assert.rejects(K.startTraining(as(trainerA), certB), /not found/);
  await assert.rejects(K.addNote(as(trainerA), certB, "snooping", false, false), /not found/);
  await assert.rejects(K.reject(as(trainerA), certB, "no access"), /not found/);
  await assert.rejects(K.signOff(as(trainerA), certB, "no access"), /not found/);
  assert.equal((await K.queue(as(trainerA))).rows.some((r) => r.id === certB), false);

  // 3. Prototype-chain bypass regression on override(): how="toString" must be rejected and NOT grant authorization.
  await assert.rejects(O.override(as(lead, true), { how: "toString", user: memberB, tool: toolB, reason: "trying prototype bypass" }), /Choose what to do/);
  assert.equal((await c.query("SELECT 1 FROM tool_auths WHERE user_id=$1 AND tool_id=$2", [memberB, toolB])).rowCount, 0);

  // 4. Separation of duties: lead cannot self-override in a rollout (memberOverride exempt/extend) nor self-void an attempt.
  await c.query("INSERT INTO tool_auths (user_id, tool_id, granted_by, source) VALUES ($1,$2,'t','training')", [lead, toolA]);
  const d2 = await T.newDraft(testId, "admin"), g2 = await T.getRevision(d2);
  await T.saveQuestion(d2, g2.rev.at, { type: "true_false", prompt_html: "Extra?", points: 1, config: { correct: true } });
  const dl = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const pub = await T.publish(d2, (await T.getRevision(d2)).rev.at, { kind: "major", note: "Added rule", deadline: dl, sources: ["training"] }, "admin");
  await assert.rejects(R.memberOverride(pub.rollout.id, lead, toolA, "exempt", null, "exempting myself", as(lead, true)), /own/);
  await assert.rejects(R.memberOverride(pub.rollout.id, lead, toolA, "extend", new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), "extending myself", as(lead, true)), /own/);
  await assert.rejects(R.memberOverride(pub.rollout.id, lead, toolA, "exempt", null, "no member id", { id: null, email: "g@x", all: true, view: true }), /member account/);

  // 5. Audit trail on renameTest, importIntoDraft, and addNote.
  await T.renameTest(testId, `Renamed-${n}`, `auditor-${n}`);
  const d3 = await T.newDraft(testId, `auditor-${n}`), exp = await T.exportRevision(revId);
  await T.importIntoDraft(d3, (await T.getRevision(d3)).rev.at, exp, `auditor-${n}`);
  const certA = (await c.query("SELECT id FROM certifications WHERE user_id=$1 AND tool_id=$2 AND state='passed'", [memberA, toolA])).rows[0].id;
  await K.addNote(as(trainerA), certA, "Checked safety stance", false, false);
  for (const act of ["training.test.rename", "training.test.import", "training.cert.note"]) {
    assert.ok((await c.query("SELECT 1 FROM audit WHERE action = $1", [act])).rowCount >= 1, `missing audit row for ${act}`);
  }
});

test("rate limits enforce caps on training action keys", { skip }, async () => {
  const { hit } = await import("../lib/limit.ts");
  const k = `train:test-limit:${Date.now()}`;
  const res = await Promise.all(Array.from({ length: 12 }, () => hit(k, 4, 60_000)));
  assert.equal(res.filter(Boolean).length, 4);
});

test("privacy: 5-year retention prunes old attempts and outbox without breaking certs; deleteUser erases training data and outbox", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { prune } = await import("../lib/retention.ts");
  const { deleteUser } = await import("../lib/profiles.ts");
  const T = await import("../lib/training/tests.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`PrivTool-${n}`])).rows[0].id;
  const u1 = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'P1', now()) RETURNING id", [`p1-${n}@x.test`])).rows[0].id;
  const u2 = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'P2', now()) RETURNING id", [`p2-${n}@x.test`])).rows[0].id;
  const tid = await T.createTest(tool, "", "t"), rid = (await T.getTest(tid)).revisions[0].id;

  const oldAtt = (await c.query("INSERT INTO attempts (user_id, revision_id, status, started_at) VALUES ($1,$2,'submitted', now() - interval '6 years') RETURNING id", [u1, rid])).rows[0].id;
  const newAtt = (await c.query("INSERT INTO attempts (user_id, revision_id, status, started_at) VALUES ($1,$2,'submitted', now()) RETURNING id", [u1, rid])).rows[0].id;
  const cert = (await c.query("INSERT INTO certifications (user_id, tool_id, revision_id, attempt_id, state) VALUES ($1,$2,$3,$4,'certified') RETURNING id", [u1, tool, rid, oldAtt])).rows[0].id;
  const oldOut = (await c.query("INSERT INTO outbox (kind, payload, created_at) VALUES ('discord', $1, now() - interval '6 years') RETURNING id", [JSON.stringify({ userId: u1, certId: cert, tool: "x" })])).rows[0].id;

  await prune();
  assert.equal((await c.query("SELECT 1 FROM attempts WHERE id = $1", [oldAtt])).rowCount, 0, "6-year-old attempt pruned");
  assert.equal((await c.query("SELECT 1 FROM attempts WHERE id = $1", [newAtt])).rowCount, 1, "recent attempt kept");
  assert.equal((await c.query("SELECT attempt_id FROM certifications WHERE id = $1", [cert])).rows[0].attempt_id, null, "cert preserved with attempt_id nulled");
  assert.equal((await c.query("SELECT 1 FROM outbox WHERE id = $1", [oldOut])).rowCount, 0, "6-year-old outbox pruned");

  // User erasure removes attempts, certifications, cert_events, and discord outbox entries.
  const u2Att = (await c.query("INSERT INTO attempts (user_id, revision_id, status) VALUES ($1,$2,'submitted') RETURNING id", [u2, rid])).rows[0].id;
  const u2Cert = (await c.query("INSERT INTO certifications (user_id, tool_id, revision_id, attempt_id, state) VALUES ($1,$2,$3,$4,'certified') RETURNING id", [u2, tool, rid, u2Att])).rows[0].id;
  await c.query("INSERT INTO cert_events (cert_id, actor, kind, note) VALUES ($1,'t','note','private')", [u2Cert]);
  await c.query("INSERT INTO outbox (kind, payload) VALUES ('discord', $1)", [JSON.stringify({ userId: u2, certId: u2Cert, tool: "x" })]);
  assert.equal(await deleteUser(u2, "admin@x.test"), true);
  assert.equal((await c.query("SELECT 1 FROM attempts WHERE user_id = $1", [u2])).rowCount, 0);
  assert.equal((await c.query("SELECT 1 FROM certifications WHERE user_id = $1", [u2])).rowCount, 0);
  assert.equal((await c.query("SELECT 1 FROM cert_events WHERE cert_id = $1", [u2Cert])).rowCount, 0);
  assert.equal((await c.query("SELECT 1 FROM outbox WHERE payload->>'userId' = $1", [String(u2)])).rowCount, 0);
});
