// node scripts/shotdiff.mjs <old.png> <new.png>  -> prints % of pixels that differ (images cropped to common size)
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs";
const [a, b] = process.argv.slice(2).map((f) => PNG.sync.read(fs.readFileSync(f)));
const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
const crop = (p) => { const o = new PNG({ width: w, height: h }); PNG.bitblt(p, o, 0, 0, w, h, 0, 0); return o; };
const n = pixelmatch(crop(a).data, crop(b).data, null, w, h, { threshold: 0.2 });
console.log(`${(100 * n / (w * h)).toFixed(2)}% differ (old ${a.width}x${a.height}, new ${b.width}x${b.height})`);
