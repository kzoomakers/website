import { test } from "node:test";
import assert from "node:assert/strict";
const { saveMembershipClasses, DEFAULT_CLASSES, toPlan, fromLegacy } = await import("../lib/membership.ts");

// Validation runs before any database call, so these need no database.
test("membership classes: a missing or empty list is refused, not saved as 'no classes'", async () => {
  await assert.rejects(saveMembershipClasses(undefined, "t"), /at least one/);
  await assert.rejects(saveMembershipClasses([], "t"), /at least one/);
});

test("membership classes: a class needs a name, a unique name and a sane fee", async () => {
  await assert.rejects(saveMembershipClasses([{ name: "  ", price: 5, per: "month" }], "t"), /needs a name/);
  await assert.rejects(saveMembershipClasses([{ name: "Tools", price: 5 }, { name: "tools", price: 6 }], "t"), /listed twice/);
  await assert.rejects(saveMembershipClasses([{ name: "Tools", price: "" }], "t"), /fee for Tools/);
  await assert.rejects(saveMembershipClasses([{ name: "Tools", price: -1 }], "t"), /fee for Tools/);
  await assert.rejects(saveMembershipClasses([{ name: "Tools", price: "abc" }], "t"), /fee for Tools/);
});

test("membership classes: the defaults match the Pricing page plans", () => {
  assert.deepEqual(DEFAULT_CLASSES.map((c) => [c.name, c.price]), [["Kzoo Makers Membership", 5], ["Clean Side Tools", 20], ["Everything Tools", 60]]);
});

// The Pricing page draws exactly what it used to: a plan stored the old way survives a trip through a class unchanged.
test("membership classes: an old Pricing plan renders the same card after becoming a class", () => {
  const old = { name: "Everything Tools", price: "60", per: "/month", normal: "Normally $85/m", offer: "Limited Time Price!", blurb: "The Whole Shebang!", note: "A Membership is Required", features: "**Woodshop Tools**\nLaser Cutters", buttonLabel: "Signup", buttonHref: "/tours" };
  assert.deepEqual({ ...toPlan(fromLegacy(old)), price: String(toPlan(fromLegacy(old)).price) }, old);
});
