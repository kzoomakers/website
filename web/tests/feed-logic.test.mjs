// Run with `npm test`. Expected values were produced by running the real Lobsters Ruby (extras/utils.rb, comment.rb and story.rb formulas) on the same inputs.
import { test } from "node:test";
import assert from "node:assert/strict";

const { hotness, confidence, confidenceOrder, normalizeUrl, cleanUrl, URL_RE } = await import("../feed/logic.ts");

test("normalize matches Ruby Utils.normalize", () => {
  for (const [i, o] of [
    ["https://www.example.com/a/index.html#frag", "example.com/a"], ["http://www10.org/", "www10.org"], ["https://e.com/?b=2&a=1&c", "e.com/?a=1&b=2&c"],
    ["https://e.com/x?a=&b=1", "e.com/x?a&b=1"], ["https://arxiv.org/pdf/2101.07554v2.pdf", "arxiv.org/abs/2101.07554v2"], ["https://www.rfc-editor.org/info/rfc9338", "rfc-editor.org/rfc/9338"],
    ["https://m.youtube.com/watch?v=abc_D-1&t=5", "youtube.com/watch?v=abc_D-1"], ["https://youtu.be/abc123", "youtube.com/watch?v=abc123"], ["https://www.youtube.com/playlist?list=PL1&x=2", "youtube.com/playlist?list=PL1"],
    ["https://e.com/index.php?x=1", "e.com?x=1"], ["https://e.com/Default.aspx", "e.com"], ["https://e.com/a?z=1?y=2", "e.com/a?y=2&z=1"], ["https://e.com/a/", "e.com/a"], ["#", ""],
  ]) assert.equal(normalizeUrl(i), o, i);
  assert.equal(normalizeUrl(""), "");
});

test("confidence matches Ruby (Wilson 80%)", () => {
  for (const [s, f, o] of [[-4, 5, 0.051273838944806784], [100, 0, 0.9838416366736703], [10, 4, 0.632113049696287], [1, 0, 0.3784475032252062], [0, 0, 0], [3, 1, 0.5135414727562647]])
    assert.ok(Math.abs(confidence(s, f) - o) < 1e-12, `${s},${f}`);
  assert.equal(confidence(10, 0, true), 0, "deleted or moderated");
});

test("confidence order sorts high confidence first, id low byte breaks ties", () => {
  assert.deepEqual([...confidenceOrder(1, 0x1ff)], [0, 0, 0xff]);
  assert.deepEqual([...confidenceOrder(0, 3)], [0xff, 0xff, 3]);
  assert.ok(Buffer.compare(confidenceOrder(0.9, 1), confidenceOrder(0.2, 1)) < 0);
});

test("hotness matches Ruby calculated_hotness", () => {
  const t = (s) => new Date(s * 1000);
  for (const [score, base, cp, ms, at, o] of [[1, 0, 0, 0, 1_700_000_000, -21464.9474946], [10, 0.25, 6, 0, 1_700_000_000, -21466.1269136], [-3, 0, 0, 0, 1_700_000_000, -21464.6464646], [0, -1, 5, 0, 1_700_000_000, -21463.6464646], [5, 0, 40.5, 3, 1_750_000_000, -22097.0009886]])
    assert.equal(hotness({ score, base, commentPoints: cp, mergedScore: ms, createdAt: t(at) }), o, `${score},${base}`);
});

test("URL_RE and tracking-param cleanup", () => {
  for (const [u, ok] of [["https://example.com", true], ["https://example", false], ["https://e.com.", false], ["https://e.com:4000/", true], ["https://en.wikipedia.org/wiki/Clerks_(film)", true], ["http://aaonline.fr/search.php?search&criteria[title-contains]=debian", true], ["https://e.com/?foo=bar#anchor", true], ["ftp://e.com", false]])
    assert.equal(URL_RE.test(u), ok, u);
  assert.equal(cleanUrl("  https://e.com/a?utm_source=x&id=2&fbclid=z&ref=q ").url, "https://e.com/a?id=2");
  assert.equal(cleanUrl("https://e.com/a?utm_source=x").url, "https://e.com/a");
  assert.equal(cleanUrl("https://e.com:443/a").url, "https://e.com/a");
  assert.equal(cleanUrl("http://e.com:80").url, "http://e.com");
  assert.equal(cleanUrl("https://e.com:8443/a").url, "https://e.com:8443/a");
  const l = cleanUrl("https://e.com/a?ref=lobsters&x=1");
  assert.equal(l.url, "https://e.com/a?x=1"); assert.equal(l.lobstersRef, true);
  assert.equal(cleanUrl("https://www.e.com/a").domain, "www.e.com");
});
