import { test } from "node:test";
import assert from "node:assert/strict";

const { PAGES, SECTIONS, SECTION_LABEL, pageOf, pagesOf, levelFor, anyLevel, entryPath } = await import("../lib/access.ts");
const { GROUPS } = await import("../lib/nav-manifest.ts");
const { visibleGroups, groupOf } = await import("../app/admin/tabs.ts");
const { SPECIAL } = await import("../lib/waiver.ts");
const { TRAINING_PERMS } = await import("../lib/training/perms.ts");
const { sectionOf } = await import("../lib/audit-areas.ts");

test("training is its own permission section with five pages, first one the sign-off queue", () => {
  assert.ok(SECTIONS.includes("training")); assert.equal(SECTION_LABEL.training, "Training");
  assert.deepEqual(pagesOf("training").map((p) => p.key), ["queue", "reports", "tests", "trainers", "settings"]);
  assert.equal(pagesOf("training")[0].path, "/admin/people/training");
  assert.ok(pagesOf("training").every((p) => !p.full), "delegable, not full-admin-only");
});

test("training URLs belong to training pages, not to People", () => {
  const k = (u) => { const p = pageOf(u); return p && `${p.section}:${p.key}`; };
  assert.equal(k("/admin/people/training"), "training:queue"); assert.equal(k("/admin/people/training/tests/4"), "training:tests"); assert.equal(k("/admin/people/training/settings"), "training:settings");
  assert.equal(k("/admin/people/tools"), "people:tools"); assert.equal(k("/admin/people"), "people:people");
});

test("grants: people access never opens training, a page grant opens only that page", () => {
  assert.equal(levelFor({ people: "write" }, "training", "queue"), undefined);
  assert.equal(levelFor({ "training:queue": "write" }, "training", "queue"), "write");
  assert.equal(levelFor({ "training:queue": "write" }, "training", "tests"), undefined, "queue access does not open the test builder");
  assert.equal(levelFor({ training: "read" }, "training", "settings"), "read");
  assert.equal(anyLevel({ "training:queue": "read" }, "training"), "read"); assert.equal(anyLevel({ "training:queue": "read" }, "people"), undefined);
  assert.equal(entryPath({ "training:tests": "read" }, "training"), "/admin/people/training/tests");
});

test("a trainer with only training access gets a top-bar entry in Members and lands on their page", () => {
  assert.ok(GROUPS.find((g) => g.label === "Members").sections.includes("training"));
  const v = visibleGroups({ training: "/admin/people/training/tests" });
  assert.deepEqual(v.map((x) => [x.group.label, x.href]), [["Home", "/admin/landing"], ["Members", "/admin/people/training/tests"]]);
  assert.equal(groupOf("/admin/people/training/tests").label, "Members");
  assert.doesNotThrow(() => visibleGroups({ training: "" }), "no first page: falls back instead of crashing");
});

test("training special permissions are listed for the Special permissions page; audit area picks up training actions", () => {
  for (const [k, label] of Object.entries(TRAINING_PERMS)) assert.equal(SPECIAL[k], label);
  assert.equal(sectionOf("training.cert.signoff"), "training");
  assert.equal(sectionOf("user.authorize"), "crm", "granting a tool stays under People in the audit log");
});
