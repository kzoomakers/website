import test from "node:test";
import assert from "node:assert/strict";
import { parseYoutubeId, cleanBlocks, cleanCompletion, lessonProblems } from "../lib/courses/blocks.ts";

test("youtube ids parse from real links and refuse lookalikes", () => {
  const id = "dQw4w9WgXcQ";
  for (const u of [`https://www.youtube.com/watch?v=${id}&t=5`, `https://youtu.be/${id}?si=x`, `https://youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `m.youtube.com/watch?v=${id}`, id]) assert.equal(parseYoutubeId(u), id, u);
  for (const u of ["https://youtube.com.evil.com/watch?v=" + id, "https://evil.com/watch?v=" + id, "javascript:alert(1)", "https://www.youtube.com/watch?v=short", "", null, 5]) assert.equal(parseYoutubeId(u), null, String(u));
});

test("blocks are cleaned: scripts stripped, bad blocks dropped and counted", () => {
  const { blocks, dropped } = cleanBlocks([
    { type: "text", html: "<p onclick=x>hi<script>bad()</script></p>" },
    { type: "text", html: "a < b\n\nsecond" },
    { type: "video", url: "https://evil.com/x" },
    { type: "video", url: "https://youtu.be/dQw4w9WgXcQ", start: 10, end: 5 },
    { type: "callout", kind: "nope", text: "x" },
    { type: "callout", kind: "danger", text: "Blade is sharp" },
    { type: "checklist", items: ["", "  Guard on  "] },
    { type: "quiz", testId: "abc" },
    { type: "quiz", testId: 7 },
    { type: "bogus" },
  ]);
  assert.equal(dropped, 4);
  assert.equal(blocks[0].html.includes("script"), false);
  assert.equal(blocks[0].html.includes("onclick"), false);
  assert.equal(blocks[1].html, "<p>a &#60; b</p><p>second</p>");
  assert.equal(blocks[2].end, undefined);
  assert.deepEqual(blocks[4].items, ["Guard on"]);
  assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length);
});

test("completion rules and problems", () => {
  assert.deepEqual(cleanCompletion({ rule: "weird" }), { rule: "viewed" });
  assert.deepEqual(cleanCompletion({ rule: "video", percent: 500 }), { rule: "video", percent: 80 });
  assert.equal(lessonProblems("T", [], { rule: "viewed" }).length, 1);
  assert.equal(lessonProblems("T", [{ id: "a", type: "divider" }], { rule: "checklist" }).length, 1);
});
