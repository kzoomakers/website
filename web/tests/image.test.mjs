// Run with `npm test`. Every uploaded image goes through processImage: any common format in, a medium-quality WebP of at most 12 megapixels out, animation kept, bad input refused with a message.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const { processImage, ImageError, uploadGate } = await import("../lib/image.ts");
const solid = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: "#38a" } });
const frames = (w, h, n) => sharp(Buffer.concat(Array.from({ length: n }, (_, i) => Buffer.alloc(w * h * 3, (i * 80) % 256))), { raw: { width: w, height: h * n, channels: 3, pageHeight: h } }).gif({ loop: 0, delay: Array(n).fill(100) }).toBuffer();
const px = (p) => p.width * p.height;
const fmt = async (p) => (await sharp(p.data).metadata()).format;
const refused = (p, re) => assert.rejects(p, (e) => e instanceof ImageError && re.test(e.message));

test("JPEG, PNG, WebP, GIF and TIFF all come out as WebP, same size", async () => {
  for (const f of ["jpeg", "png", "webp", "gif", "tiff"]) {
    const r = await processImage(await solid(64, 48)[f]().toBuffer());
    assert.deepEqual([await fmt(r), r.width, r.height, r.animated], ["webp", 64, 48, false], f);
  }
});

test("a 20 megapixel image is shrunk to 12 megapixels or less", async () => {
  const r = await processImage(await solid(5000, 4000).png().toBuffer());
  assert.ok(px(r) <= 12e6 && px(r) > 11e6, `${r.width}x${r.height}`);
});

test("animated GIF and animated WebP come out as an animated WebP; still: true keeps one frame", async () => {
  const gif = await frames(40, 30, 3);
  const a = await processImage(gif);
  assert.deepEqual([await fmt(a), a.animated, a.width, a.height, (await sharp(a.data, { animated: true }).metadata()).pages], ["webp", true, 40, 30, 3]);
  const w = await processImage(await sharp(gif, { animated: true }).webp().toBuffer());
  assert.ok(w.animated);
  assert.equal((await processImage(gif, { still: true })).animated, false);
  const big = await processImage(await frames(4000, 3000, 2)); // two 12MP frames: right at the cap
  assert.ok(big.animated && px(big) <= 12e6);
});

test("fit: inside a box without enlarging, or filling it exactly with cover", async () => {
  const png = await solid(400, 200).png().toBuffer();
  const a = await processImage(png, { fit: { width: 100, height: 100 } });
  assert.deepEqual([a.width, a.height], [100, 50]);
  const b = await processImage(png, { fit: { width: 1000 } });
  assert.deepEqual([b.width, b.height], [400, 200]);
  const c = await processImage(png, { fit: { width: 60, height: 60, cover: true } });
  assert.deepEqual([c.width, c.height], [60, 60]);
});

test("HEIC becomes a WebP, and a 20 megapixel HEIC is shrunk to 12 megapixels or less", async () => {
  const t = await processImage(readFileSync("tests/fixtures/tiny.heic"));
  assert.deepEqual([await fmt(t), t.width, t.height], ["webp", 64, 48]);
  const b = await processImage(readFileSync("tests/fixtures/big-20mp.heic"));
  assert.ok(px(b) <= 12e6 && px(b) > 11e6, `${b.width}x${b.height}`);
});

test("refused with a message: garbage, SVG, over 30 MB, a huge animation, and a timeout", async () => {
  await refused(processImage(Buffer.from("not an image")), /couldn't be read/);
  await refused(processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), /SVG/);
  await refused(processImage(Buffer.alloc(31 * 1024 * 1024)), /30 MB/);
  await refused(processImage(await frames(400, 400, 160)), /animation is too big/); // 25.6 million pixels in all
  await refused(processImage(await solid(64, 48).png().toBuffer(), { timeoutMs: 1 }), /too long/);
});

test("2 run at once, 4 wait, the rest are told the server is busy", async () => {
  const png = await solid(64, 48).png().toBuffer();
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => processImage(png)));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 6);
  assert.equal(r.filter((x) => x.status === "rejected" && /busy/.test(x.reason.message)).length, 2);
});

test("still: true on a long animation keeps the first frame instead of refusing it", async () => {
  const r = await processImage(await frames(400, 400, 160), { still: true });
  assert.deepEqual([await fmt(r), r.animated, r.width, r.height], ["webp", false, 400, 400]);
});

test("email: JPEG for a still (transparency goes white), GIF for an animation", async () => {
  const j = await processImage(await solid(64, 48).png().toBuffer(), { email: true });
  assert.deepEqual([await fmt(j), j.format], ["jpeg", "jpeg"]);
  const g = await processImage(await frames(40, 30, 3), { email: true });
  assert.deepEqual([await fmt(g), g.animated], ["gif", true]);
});

test("uploadGate: needs a size, refuses too big, and a busy 503 does not use up the hourly allowance", async () => {
  const req = (len) => new Request("http://x/", { method: "POST", headers: len ? { "content-length": String(len) } : {} });
  assert.equal((await uploadGate(req(0), "g1")).status, 411);
  assert.equal((await uploadGate(req(32 * 1024 * 1024), "g1")).status, 413);
  assert.equal(await uploadGate(req(1000), "g1", 2), null);
  assert.equal(await uploadGate(req(1000), "g1", 2), null);
  assert.equal((await uploadGate(req(1000), "g1", 2)).status, 429);
  // fill the 2 running + 4 waiting places, then retry 10 times: all busy, none counted
  const png = await solid(64, 48).png().toBuffer();
  const jobs = Array.from({ length: 6 }, () => processImage(png));
  for (let i = 0; i < 10; i++) assert.equal((await uploadGate(req(1000), "g2", 2)).status, 503);
  await Promise.all(jobs);
  assert.equal(await uploadGate(req(1000), "g2", 2), null);
});
