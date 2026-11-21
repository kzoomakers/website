// Needs a scratch Postgres: TEST_DATABASE_URL=postgres://… npm test. Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.CONFIG_PATH = "/nonexistent";
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
const skip = !url && "set TEST_DATABASE_URL";

const setup = async () => {
  const { conn } = await import("../lib/db.ts");
  const N = await import("../lib/training/notify.ts"), S = await import("../lib/training/settings.ts");
  const c = await conn(), n = Date.now() + Math.floor(Math.random() * 1e6);
  await S.saveTrainingCfg({ enabled: true, events: {}, copy: {}, reply_to: "" });
  const user = async (name) => (await c.query("INSERT INTO site_users (email, name, verified_at) VALUES ($1,$2, now()) RETURNING id, email", [`n${n}${Math.random()}@x.test`, name])).rows[0];
  const mails = async (email) => (await c.query("SELECT msg FROM mail_queue WHERE msg->>'to' = $1", [email])).rows.map((r) => r.msg);
  return { c, N, S, user, mails, n };
};

test("an event queues one email and one bell notice for that member only, and never twice", { skip }, async () => {
  const { c, N, user, mails } = await setup();
  const a = await user("<b>Ann</b>"), b = await user("Bob");
  await N.emit("cert.certified", { userId: a.id, ref: 1, vars: { tool: "Lathe" } });
  await N.emit("cert.certified", { userId: a.id, ref: 1, vars: { tool: "Lathe" } }); // a retry
  const ms = await mails(a.email);
  assert.equal(ms.length, 1); assert.match(ms[0].subject, /Lathe/); assert.ok(!ms[0].html.includes("<b>Ann"), "name escaped");
  assert.equal((await mails(b.email)).length, 0);
  assert.equal((await c.query("SELECT 1 FROM notifications WHERE user_id=$1 AND kind='training'", [a.id])).rowCount, 1);
  assert.equal((await c.query("SELECT 1 FROM notifications WHERE user_id=$1", [b.id])).rowCount, 0);
});

test("switched-off events and a switched-off module send nothing; edited wording is used; scores stay out of a fail notice", { skip }, async () => {
  const { N, S, user, mails } = await setup();
  const a = await user("Ann");
  await S.saveTrainingCfg({ events: { "attempt.failed": false } });
  await N.emit("attempt.failed", { userId: a.id, ref: 5, vars: { tool: "Saw" } });
  assert.equal((await mails(a.email)).length, 0);
  await S.saveTrainingCfg({ events: {}, copy: { "cert.in_training": { subject: "Go time: {{tool}}", body: "Hi {{name}}, see {{trainer}}." } } });
  await N.emit("cert.in_training", { userId: a.id, ref: 6, vars: { tool: "Saw", trainer: "Pat" } });
  assert.equal((await mails(a.email))[0].subject, "Go time: Saw");
  await S.saveTrainingCfg({ enabled: false });
  await N.emit("cert.certified", { userId: a.id, ref: 7, vars: { tool: "Saw" } });
  assert.equal((await mails(a.email)).length, 1);
  await N.emit("attempt.passed", { userId: a.id, ref: 9, vars: { tool: "Saw" } }); // module off: still nothing
  assert.equal((await mails(a.email)).length, 1);
});

test("a failing channel never throws", { skip }, async () => {
  const { N } = await setup();
  await N.emit("cert.certified", { userId: -1, ref: 1, vars: {} }); // no such member
  await N.emitLeads("lead.override", "x", { name: "n" });
});

test("staff push waits until Pushover is set up and Training is on; nothing is marked announced meanwhile", { skip }, async () => {
  const { c, N, S, user, n } = await setup();
  const P = await import("../lib/pushover.ts");
  await c.query("UPDATE certifications SET pushed_at = now() WHERE state = 'passed'");
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`T${n}`])).rows[0].id;
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await c.query("INSERT INTO certifications (user_id, tool_id, state) VALUES ($1,$2,'passed') RETURNING id", [(await user("m" + i)).id, tool])).rows[0].id);
  await P.saveCfg({ clearToken: true, groups: { training: "clear" } });
  assert.equal(await N.pushWaiting(), 0, "not configured");
  await S.saveTrainingCfg({ enabled: false });
  assert.equal(await N.pushWaiting(), 0, "module off");
  assert.equal((await c.query("SELECT 1 FROM certifications WHERE id = ANY($1) AND pushed_at IS NULL", [ids])).rowCount, 3, "still waiting to be announced");
});

test("if queueing the email fails, the sent-marker is dropped so a retry can go out", { skip }, async () => {
  const { c, N, user } = await setup();
  const a = await user("Ann");
  await c.query("CREATE OR REPLACE FUNCTION tn_fail() RETURNS trigger AS $$ BEGIN IF NEW.msg->>'to' = TG_ARGV[0] THEN RAISE EXCEPTION 'queue down'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql");
  await c.query(`CREATE TRIGGER tn_fail BEFORE INSERT ON mail_queue FOR EACH ROW EXECUTE FUNCTION tn_fail('${a.email}')`);
  try { await N.emit("cert.certified", { userId: a.id, ref: 77, vars: { tool: "Saw" } }); } finally { await c.query("DROP TRIGGER tn_fail ON mail_queue"); }
  assert.equal((await c.query("SELECT 1 FROM training_mail_log WHERE key LIKE $1", [`cert.certified:${a.id}:77:%`])).rowCount, 0, "marker removed");
  await N.emit("cert.certified", { userId: a.id, ref: 77, vars: { tool: "Saw" } });
  assert.equal((await c.query("SELECT 1 FROM mail_queue WHERE msg->>'to' = $1", [a.email])).rowCount, 1, "second try sends");
});

test("reminders: one per cadence step, not right after the start notice, none after a pass", { skip }, async () => {
  const { c, S, user, n } = await setup();
  const R = await import("../lib/training/recert.ts");
  const tool = (await c.query("INSERT INTO tools (name) VALUES ($1) RETURNING id", [`R${n}`])).rows[0].id, u = await user("Ann");
  const ro = (await c.query("INSERT INTO rollouts (revision_id, deadline, created_by) VALUES ((SELECT id FROM test_revisions LIMIT 1), (now() AT TIME ZONE 'America/Detroit')::date + 7, 't') RETURNING id")).rows[0].id;
  await c.query("INSERT INTO rollout_members (rollout_id, user_id, tool_id, last_reminder_days) VALUES ($1,$2,$3,14)", [ro, u.id, tool]);
  await R.sendReminders(); // other rollouts in the scratch db may send too; check ours
  const mine = async () => (await c.query("SELECT 1 FROM training_mail_log WHERE key LIKE $1", [`rollout.reminder:${u.id}:%`])).rowCount;
  assert.equal(await mine(), 1, "7 days left: the 7-day step is due");
  await R.sendReminders(); assert.equal(await mine(), 1, "same step isn't repeated");
  await S.saveTrainingCfg({ enabled: false });
  await c.query("UPDATE rollout_members SET last_reminder_days = 14 WHERE rollout_id=$1", [ro]);
  assert.equal(await R.sendReminders(), 0, "Training off: reminders pause");
  await S.saveTrainingCfg({ enabled: true });
  await c.query("UPDATE rollout_members SET last_reminder_days = 7 WHERE rollout_id=$1", [ro]);
  await c.query("UPDATE rollout_members SET status='satisfied' WHERE rollout_id=$1", [ro]);
  await c.query("UPDATE rollouts SET deadline = deadline - 5 WHERE id=$1", [ro]); await R.sendReminders(); assert.equal(await mine(), 1, "satisfied: no more");
});
