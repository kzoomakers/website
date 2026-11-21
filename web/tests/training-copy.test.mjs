import { test } from "node:test";
import assert from "node:assert/strict";
const { EVENTS, render, esc } = await import("../lib/training/copy.ts");

test("values are escaped in HTML and can't break a subject; the template runs nothing", () => {
  const v = { name: "<script>alert(1)</script>", tool: "Saw\r\nBcc: x@y.z", link: "https://x.test/a?b=1&c=2", reason: "{{name}}" };
  const m = render(EVENTS["cert.rejected"], v);
  assert.ok(!m.html.includes("<script>")); assert.ok(m.html.includes("&lt;script&gt;"));
  assert.ok(!/[\r\n]/.test(m.subject), "no line breaks in a subject");
  assert.ok(m.html.includes('<a href="https://x.test/a?b=1&amp;c=2">'), "link is a real escaped anchor");
  assert.ok(m.text.includes("{{name}}"), "a value that looks like a variable is shown as text, not expanded again");
});
test("every event renders with no variables left unfilled when all are given", () => {
  const all = { name: "A", tool: "T", deadline: "D", trainer: "P", reason: "R", days: "3 days", link: "https://x.test" };
  for (const [k, e] of Object.entries(EVENTS)) { const m = render(e, all); assert.ok(!m.subject.includes("{{") && !m.text.includes("{{"), k); }
});
test("esc covers quotes", () => assert.equal(esc(`<a href="x">'`), "&lt;a href=&quot;x&quot;&gt;&#39;"));
test("a link with $ characters comes through unchanged", () => {
  const link = "https://x.test/a?b=$&c=$1";
  assert.ok(render(EVENTS["cert.certified"], { name: "A", tool: "T", link }).html.includes(`<a href="https://x.test/a?b=$&amp;c=$1">`));
});
