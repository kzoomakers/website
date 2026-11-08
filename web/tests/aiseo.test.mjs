// Run with `npm test`. Page text, summary and JSON-LD used for search/AI optimization.
import { test } from "node:test";
import assert from "node:assert";
import { pageText, summaryOf, jsonLd, ldScript, llmsTxt } from "../lib/aiseo.ts";

const page = { root: { props: { title: "Classes", description: "" } }, content: [{ type: "X", props: { id: "a", title: "Welding", text: "<b>Learn</b> to weld", href: "/x", image: "/i.png", buttons: [{ label: "Join", href: "https://e.com" }] } }] };
const contact = { address: "1 Main", phone: "1", email: "a@b.c" };

test("pageText keeps readable strings, drops links and ids", () => assert.equal(pageText(page), "Welding Learn to weld Join"));
test("summary prefers the description, else cuts text at a word", () => {
  assert.equal(summaryOf({ root: { props: { description: "Hi" } } }), "Hi");
  assert.equal(summaryOf(page, 10), "Welding…");
});
test("home gets LocalBusiness, other pages a breadcrumb", () => {
  assert.equal(jsonLd("index", page, contact, "https://s").at(-1)["@type"], "LocalBusiness");
  assert.equal(jsonLd("classes", page, contact, "https://s").at(-1).itemListElement[1].item, "https://s/classes");
});
test("ldScript cannot close the script tag", () => assert.ok(!ldScript([{ a: "</script>" }]).includes("<")));
test("llms.txt lists pages", () => assert.match(llmsTxt("intro", [{ url: "u", title: "T", summary: "s" }]), /- \[T\]\(u\): s/));
import { articleLd } from "../lib/aiseo.ts";
test("blog post gets a BlogPosting, image and author only when present", () => {
  const a = articleLd({ title: "T", excerpt: "e", image: "", date: "d", modified: "m", author: null, url: "u" }, "https://s")[0];
  assert.equal(a["@type"], "BlogPosting");
  assert.ok(!("image" in a) && !("author" in a));
});
import { canonicalOf, listed, aiRobots } from "../lib/aiseo.ts";
const ed = (props) => ({ root: { props: { title: "T", ...props } }, content: [] });
test("editor overrides: summary, canonical, schema type, FAQs", () => {
  assert.equal(summaryOf(ed({ aiSummary: "S", description: "D" })), "S");
  assert.equal(canonicalOf("a", ed({ canonical: " https://x/y " }), "https://s"), "https://x/y");
  assert.deepEqual(jsonLd("a", ed({ schemaType: "none" }), contact, "https://s"), []);
  const out = jsonLd("a", ed({ schemaType: "Course", aiFaqs: [{ question: "Q?", answer: "A" }, { question: "", answer: "x" }] }), contact, "https://s");
  assert.deepEqual(out.map((o) => o["@type"]), ["WebPage", "Course", "BreadcrumbList", "FAQPage"]);
  assert.equal(out.at(-1).mainEntity.length, 1);
});
test("hidden pages are unlisted and blocked for AI crawlers only", () => {
  assert.ok(listed(ed({})) && !listed(ed({ aiExclude: true })) && !listed(ed({ noindex: true })));
  const r = aiRobots(["secret", "index"]);
  assert.match(r, /User-agent: GPTBot\nDisallow: \/secret\$\nDisallow: \/\$/);
  assert.ok(!/User-agent: \*/.test(r) && aiRobots([]) === "");
});

import { absUrl, ttl } from "../lib/aiseo.ts";
test("page text keeps sentences that start with # and drops pure links", () => {
  assert.equal(pageText({ content: [{ props: { a: "#1 makerspace in town", b: "#top", c: "/classes", d: "mailto:a@b.c" } }] }), "#1 makerspace in town");
});
test("a malformed canonical is ignored", () => assert.equal(canonicalOf("a", ed({ canonical: "classes now" }), "https://s"), "https://s/a"));
test("relative image addresses become absolute", () => { assert.equal(absUrl("https://s", "/u/x.jpg"), "https://s/u/x.jpg"); assert.equal(absUrl("https://s", "https://c/x.jpg"), "https://c/x.jpg"); });
test("ttl runs once within the window and retries after a failure", async () => {
  let n = 0; const f = ttl(60_000, async () => ++n);
  await Promise.all([f(), f()]); assert.equal(await f(), 1);
  let m = 0; const g = ttl(60_000, async () => { if (!m++) throw new Error("x"); return m; });
  await assert.rejects(g()); assert.equal(await g(), 2);
});
