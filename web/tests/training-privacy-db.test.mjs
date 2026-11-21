// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise (tests must never touch a real database).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
process.env.ALLOW_DEV_ADMIN = "1"; // a full administrator whose email is "dev"
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

// A member who has passed a test (so a certification, an attempt and a stored answer exist), plus a trainer's shared and private notes.
const seed = async () => {
  const { conn } = await import("../lib/db.ts");
  const T = await import("../lib/training/tests.ts"), A = await import("../lib/training/attempts.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true });
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`Router ${n}`])).rows[0].id;
  const user = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'Pat Privacy', now()) RETURNING id", [`priv${n}@x.test`])).rows[0].id;
  const trainer = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'Terry Trainer', now()) RETURNING id", [`trainer${n}@x.test`])).rows[0].id;
  const id = await T.createTest(tool, "", "t"), r = (await T.getTest(id)).revisions[0].id;
  const q = await T.saveQuestion(r, (await T.getRevision(r)).rev.at, { type: "true_false", prompt_html: "<p>Bit <b>safe</b>?</p>", points: 1, config: { correct: true } });
  await T.publish(r, (await T.getRevision(r)).rev.at, {}, "t");
  const qid = (await T.getRevision(r)).questions[0].id;
  const v = await A.start(user, id);
  await A.submit(user, v.attemptId, { [qid]: true });
  const cert = (await c.query("SELECT id FROM certifications WHERE user_id = $1 AND tool_id = $2", [user, tool])).rows[0].id;
  await c.query("INSERT INTO cert_events (cert_id, actor, kind, note, shared) VALUES ($1,'trainer@kz','note','Shared: good with the bit',true), ($1,'trainer@kz','note','Private: nervous around the bit',false)", [cert]);
  await c.query("INSERT INTO cert_signoffs (cert_id, trainer_id, note) VALUES ($1,$2,'Private sign-off remark')", [cert, trainer]);
  await c.query("INSERT INTO training_accommodations (user_id, time_multiplier, read_aloud, notes, set_by) VALUES ($1, 1.5, true, 'reader', 'trainer@kz')", [user]);
  return { c, A, id, tool, user, trainer, cert, attempt: v.attemptId, qid };
};

test("the member's own record leaves out private notes, staff addresses and sign-off remarks; the staff record has them", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { trainingRecord } = await import("../lib/training/privacy.ts");
  const { user } = await seed();
  const c = await conn();
  await c.query("UPDATE certifications SET certified_by = 'trainer@kz' WHERE user_id = $1", [user]);
  await c.query("UPDATE attempts SET voided_reason = 'Staff-only reason' WHERE user_id = $1", [user]);
  const own = JSON.stringify(await trainingRecord(c, user, true));
  assert.equal(own.includes("Staff-only reason"), false, "no staff text on attempts");
  assert.equal(own.includes("Shared: good with the bit"), true, "shared notes are the member's");
  assert.equal(own.includes("Private: nervous"), false, "private notes stay with staff");
  assert.equal(own.includes("Private sign-off remark"), false);
  assert.equal(own.includes("trainer@kz"), false, "no staff addresses");
  assert.equal(own.includes("Pat Privacy"), true);
  const staff = await trainingRecord(c, user, false);
  assert.equal(staff.events.some((e) => e.note.startsWith("Private")), true);
  assert.equal(staff.signoffs[0].note, "Private sign-off remark");
  assert.deepEqual(staff.accommodation.time_multiplier, 1.5);
});

test("evidence for an attempt is the stored answer and the revision it ran on, with network details", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { attemptEvidence } = await import("../lib/training/privacy.ts");
  const { user, attempt, qid } = await seed();
  const ev = await attemptEvidence(await conn(), attempt);
  assert.equal(ev.userId, user);
  assert.equal(ev.data.questions.length, 1);
  assert.equal(ev.data.questions[0].given, true, "the answer exactly as submitted");
  assert.equal(ev.data.questions[0].prompt, "Bit safe?", "the prompt as plain text");
  assert.equal(ev.data.revision.content_hash.length > 0, true, "the revision fingerprint");
  assert.equal(typeof ev.data.exported_at, "string");
  assert.equal(String(qid).length > 0, true);
});

test("staff read the training record and the evidence through the logged PII path; each is one logged row", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const P = await import("../lib/pii.ts");
  const { user, attempt } = await seed();
  const c = await conn();
  await P.saveCfg({ locked: false });
  const req = new Request("http://x/api/pii/retrieve", { method: "POST", headers: { "user-agent": "test", "fly-client-ip": "9.9.9.9" } });
  const before = (await c.query("SELECT count(*)::int n FROM pii_access")).rows[0].n;
  const rec = await P.retrieve(req, "training", { type: "member", id: user }, "legal", "subject access request");
  assert.equal(rec.attempts.length >= 1, true);
  assert.equal(rec.events.some((e) => e.note.startsWith("Private")), true, "staff see private notes");
  const ev = await P.retrieve(req, "training_attempt", { type: "member", id: user, attempt }, "safety", "dispute");
  assert.equal(ev.attempt.id, attempt);
  assert.equal(ev.network.ip, "", "ip is recorded only when the request came with one");
  assert.equal((await c.query("SELECT count(*)::int n FROM pii_access")).rows[0].n, before + 2, "two reads, two rows");
  const row = (await c.query("SELECT kind, subject_id, reason FROM pii_access ORDER BY id DESC LIMIT 1")).rows[0];
  assert.deepEqual([row.kind, row.subject_id, row.reason], ["training_attempt", user, "safety"]);
  await assert.rejects(P.retrieve(req, "training_attempt", { type: "member", id: user, attempt: 2147483000 }, "safety", "x"), /Nothing on file/);
});

test("the member's own download is logged as self", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { logSelf } = await import("../lib/pii.ts");
  const { user } = await seed();
  const c = await conn();
  const req = new Request("http://x/api/members/training/export", { headers: { "user-agent": "test" } });
  const email = (await c.query("SELECT email FROM site_users WHERE id = $1", [user])).rows[0].email;
  await logSelf(req, { id: user, email }, { type: "member", id: user }, "training", "Pat Privacy", ["training_record"]);
  const row = (await c.query("SELECT via, kind FROM pii_access WHERE subject_id = $1 ORDER BY id DESC LIMIT 1", [user])).rows[0];
  assert.deepEqual([row.via, row.kind], ["self", "training"]);
});

test("erasing a member removes their training record, accommodation and authorization, and no one else's", { skip }, async () => {
  const { conn } = await import("../lib/db.ts");
  const { deleteUser } = await import("../lib/profiles.ts");
  const { user, trainer, tool, cert } = await seed();
  const c = await conn();
  const other = (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,'Other', now()) RETURNING id", [`other${Date.now()}@x.test`])).rows[0].id;
  await c.query("INSERT INTO tool_auths (user_id, tool_id, granted_by, source) VALUES ($1,$2,'x','legacy') ON CONFLICT DO NOTHING", [other, tool]);
  assert.equal(await deleteUser(user, "dev"), true);
  for (const [sql, label] of [
    ["SELECT 1 FROM attempts WHERE user_id = $1", "attempts"],
    ["SELECT 1 FROM certifications WHERE user_id = $1", "certifications"],
    ["SELECT 1 FROM training_accommodations WHERE user_id = $1", "accommodation"],
    ["SELECT 1 FROM tool_auths WHERE user_id = $1", "authorizations"],
  ]) assert.equal((await c.query(sql, [user])).rowCount, 0, `${label} erased`);
  assert.equal((await c.query("SELECT 1 FROM cert_events WHERE cert_id = $1", [cert])).rowCount, 0, "their notes go with the certification");
  assert.equal((await c.query("SELECT 1 FROM site_users WHERE id = $1", [trainer])).rowCount, 1, "the trainer stays");
  assert.equal((await c.query("SELECT 1 FROM tool_auths WHERE user_id = $1", [other])).rowCount, 1, "other people's rows are untouched");
});
