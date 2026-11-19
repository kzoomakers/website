import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { checkReason, REASONS, PII_PERM } = await import("../lib/pii-shared.ts");
const { chainHash, checkRows, GENESIS } = await import("../lib/pii-chain.ts");

test("a reason is required, and 'other' needs words", () => {
  assert.equal(checkReason("", ""), "Choose a reason.");
  assert.equal(checkReason("curiosity", ""), "Choose a reason.");
  assert.equal(checkReason("other", " "), "Explain the reason.");
  assert.deepEqual(checkReason("tour", " hi "), { reason: "tour", note: "hi" });
  assert.deepEqual(checkReason("other", "lost keys"), { reason: "other", note: "lost keys" });
  assert.ok(Object.keys(REASONS).every((r) => typeof checkReason(r, "enough words")  !== "string"));
});

test("every kind of PII maps to a special permission", () => {
  for (const k of ["personal", "emergency", "id", "signed_doc", "id_renewal"]) assert.match(PII_PERM[k], /^pii\./);
});

const row = (n, extra = {}) => ({ at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)), viewer_id: 1, viewer_email: "a@x.org", viewer_is_admin: false, subject_type: "member", subject_id: n, subject_name: "Pat " + n, kind: "personal", fields: ["phone"], reason: "tour", note: "", via: "ui", ip: "1.2.3.4", ua: "t", request_path: "/api/pii/retrieve", ...extra });
const chain = (n) => { let prev = GENESIS; return Array.from({ length: n }, (_, i) => { const r = row(i + 1); const x = { ...r, id: i + 1, prev_hash: prev, hash: chainHash(prev, r) }; prev = x.hash; return x; }); };

test("the hash chain passes when untouched and names the first row that was changed, removed or reordered", () => {
  const rows = chain(5);
  assert.deepEqual(checkRows(rows), { head: rows[4].hash });
  assert.deepEqual(checkRows(rows.map((r) => (r.id === 3 ? { ...r, reason: "legal" } : r))), { bad: 3 }, "edited row");
  assert.deepEqual(checkRows(rows.filter((r) => r.id !== 2)), { bad: 3 }, "removed row");
  assert.deepEqual(checkRows([rows[1], rows[0], ...rows.slice(2)]), { bad: 2 }, "reordered rows");
  assert.deepEqual(checkRows(rows.slice(2), rows[1].hash), { head: rows[4].hash }, "continues from a known hash");
});

// Every file that reads PII tables or decrypts IDs and documents must be on this list. A new route that touches them without going through lib/pii.ts fails here.
const PII_SQL = /\b(emergency_contacts|guest_contacts|guest_ids|member_ids)\b|id_renewals\b[^`"']*\bdata\b|signedPdfOf|signedPdf\(|photoOf|myImage|listContacts/;
const ALLOWED = new Set([
  "lib/pii.ts", "lib/db.ts", "lib/profiles.ts", "lib/guests.ts", "lib/id-card.ts", "lib/onboarding.ts", "lib/approvals.ts", "lib/readers.ts", "lib/waiver.ts", "lib/sign.ts", "lib/crm.ts", "lib/memo.ts", "lib/vault.ts", "lib/notifications.ts",
  "app/api/account/route.ts", "app/account/page.tsx", "app/api/guests/contacts/route.ts", "app/api/guests/photo/route.ts", "app/api/guests/pdf/route.ts", "app/api/members/id/image/route.ts", "app/api/members/id/route.ts", "app/api/webmaster/member-file/route.ts",
]);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" || e.name.startsWith(".") ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test("nothing outside the known PII paths reads emergency contacts, IDs or signed documents", () => {
  const bad = ["app", "lib", "components"].flatMap(walk).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).filter((f) => PII_SQL.test(fs.readFileSync(f, "utf8"))).filter((f) => !ALLOWED.has(f.split(path.sep).join("/")));
  assert.deepEqual(bad, [], "these files read PII without being on the list in tests/pii.test.mjs: route them through retrieve() in lib/pii.ts, or add them here if they only show a person their own data");
});

test("staff screens never import the raw PII readers", () => {
  const RAW = /\b(listContacts|photoOf|signedPdfOf|myImage|viewId|viewSide)\b/;
  const bad = walk("app").filter((f) => /\.tsx?$/.test(f) && f.includes(`${path.sep}admin${path.sep}`)).filter((f) => RAW.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});

test("the report is for the month that just ended, in site time", async () => {
  const { lastFullMonth } = await import("../lib/pii-months.ts");
  const tz = "America/Detroit", at = (iso) => lastFullMonth(new Date(iso), tz);
  assert.equal(at("2026-11-18T12:00:00Z"), "2026-10");
  assert.equal(at("2026-01-15T12:00:00Z"), "2025-12", "January reports December");
  assert.equal(at("2026-02-01T03:00:00Z"), "2025-12", "still Jan 31 evening in Detroit: January isn't over yet");
  assert.equal(at("2026-02-01T06:00:00Z"), "2026-01", "midnight on the 1st in Detroit");
  assert.equal(at("2026-03-01T06:00:00Z"), "2026-02", "February (28 days)");
});
