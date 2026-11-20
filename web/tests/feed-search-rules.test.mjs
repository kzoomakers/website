// Run with `npm test`. Query parsing for the Talk search page.
import { test } from "node:test";
import assert from "node:assert/strict";

const { parseQuery, prefixQuery, splitHits, hasHit } = await import("../feed/search-rules.ts");

test("filters are pulled out of the text, quotes stay together", () => {
  const p = parseQuery('laser "kerf width" tag:Laser domain:Example.com submitter:Jem commenter:bob -acrylic');
  assert.equal(p.text, 'laser "kerf width" -acrylic');
  assert.deepEqual([p.tags, p.domains, p.submitters, p.commenters], [["laser"], ["example.com"], ["jem"], ["bob"]]);
});
test("a filter with nothing usable after it is plain text; odd characters are stripped", () => {
  assert.equal(parseQuery("tag:").text, "tag:");
  assert.deepEqual(parseQuery("tag:a'b;c").tags, ["abc"]);
  assert.equal(parseQuery("x".repeat(500)).text.length, 200);
});
test("prefix query for partial words, none when search syntax is used", () => {
  assert.equal(prefixQuery("lase cut"), "lase:* & cut:*");
  assert.equal(prefixQuery('"exact phrase"'), null);
  assert.equal(prefixQuery("a OR b"), null);
  assert.equal(prefixQuery("-x"), null);
  assert.equal(prefixQuery("!!!"), null);
  assert.equal(prefixQuery("a b c d e f g h i j").split(" & ").length, 8);
});
test("headline markers split into pieces and are never treated as HTML", () => {
  assert.deepEqual(splitHits("use the ⟦laser⟧ <b>now</b>"), [["use the ", false], ["laser", true], [" <b>now</b>", false]]);
  assert.ok(hasHit("a ⟦b⟧") && !hasHit("a b") && !hasHit(null));
});
