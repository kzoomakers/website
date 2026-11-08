// Run with `npm test`. The HEIC fallback is installed and fails cleanly, and the size cap can see a huge image from its header alone.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";
import sharp from "sharp";
import convert from "heic-convert";

test("heic-convert is installed and refuses garbage instead of hanging", async () => {
  await assert.rejects(convert({ buffer: Buffer.from("not an image"), format: "JPEG" }));
});

test("sharp reads a big image's size from the header alone", async () => {
  const png = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer();
  const m = await sharp(png).metadata();
  assert.ok(m.width * m.height > 50e6);
});
