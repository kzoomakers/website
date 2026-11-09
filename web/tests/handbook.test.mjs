// Run with `npm test`. Handbook edits become before/after diffs, and the update email shows exactly what changed (safely escaped).
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";
import { diffVersions } from "../lib/waiver-diff.ts";

const { toVersion, updateDesign, summaryHtml } = await import("../lib/handbook.ts");
const book = (rules, intro = "Hello") => ({ intro, sections: [{ title: "Safety", items: rules.map(([title, text]) => ({ title, text })) }] });
const before = book([["Eyes", "Wear safety glasses."], ["Hair", "Tie back long hair."]]);

test("only real wording changes count: edits, additions and removals are found", () => {
  assert.equal(diffVersions(toVersion(before), toVersion(before)).length, 0);
  const after = book([["Eyes", "Always wear safety glasses."], ["Gloves", "No gloves near saws."]]);
  const kinds = Object.fromEntries(diffVersions(toVersion(before), toVersion(after)).map((c) => [c.heading, c.kind]));
  assert.deepEqual(kinds, { "Safety: Eyes": "changed", "Safety: Gloves": "added", "Safety: Hair": "removed" });
});

test("the email shows new wording bold, removed struck through, and escapes the text", () => {
  const ch = diffVersions(toVersion(before), toVersion(book([["Eyes", "Wear <b>goggles</b>."], ["Hair", "Tie back long hair."]])));
  const html = updateDesign(ch, "- Eyes: goggles now", true).blocks.map((b) => b.html ?? "").join("");
  assert.match(html, /<s>.*glasses/);
  assert.match(html, /<strong>.*goggles/);
  assert.ok(!html.includes("<b>goggles"), "typed markup must be escaped");
  assert.match(html, /<li>Eyes: goggles now<\/li>/);
});

test("without the exact-changes option the email has no wording diff", () => {
  const ch = diffVersions(toVersion(before), toVersion(book([["Eyes", "Goggles."], ["Hair", "Tie back long hair."]])));
  assert.ok(!updateDesign(ch, "", false).blocks.some((b) => /<s>|<strong>/.test(b.html ?? "")));
  assert.equal(summaryHtml("a\nb"), '<p style="margin:0 0 14px">a<br>b</p>');
});
