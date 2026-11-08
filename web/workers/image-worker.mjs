// Child process: any image on stdin -> one WebP (animated stays animated) of at most 12 megapixels on stdout, at medium quality.
// argv[2] = JSON { still?: boolean, email?: boolean, fit?: { width?, height?, cover? } }. `email` writes JPEG (GIF if animated) instead of WebP. `still` keeps only the first frame; `fit` shrinks to fit inside width x height (or fills it exactly with `cover`).
// Runs apart from the web server so a huge or hostile file can only hurt this process (the parent times it out and kills it).
// A message printed as "reject: ..." on stderr is shown to the member; anything else is logged and replaced by a generic one.
import sharp from "sharp";
import convert from "heic-convert";

const QUALITY = 75; // medium
const MAX_PIXELS = 12e6, MAX_STILL = 250e6, MAX_ANIMATED = 25e6, MAX_HEIC = 50e6; // the input caps count every frame of an animation: libvips holds them all in memory
class Reject extends Error {}

async function run(buf, { still, fit, email }) {
  const img = sharp(buf, { animated: !still, limitInputPixels: false });
  const m = await img.metadata(), pages = still ? 1 : m.pages ?? 1, w = m.width ?? 0, h = m.pageHeight ?? m.height ?? 0;
  if (!w || !h) throw new Error("no size");
  if (m.format === "svg") throw new Reject("SVG isn't accepted. Export it as a PNG or JPG first.");
  if (w * h * pages > (pages > 1 ? MAX_ANIMATED : MAX_STILL)) throw new Reject(pages > 1 ? "That animation is too big (too many frames or too large). Use a shorter or smaller one." : "That image has too many pixels. Use a smaller one.");
  let out = pages > 1 ? img : img.rotate(); // rotate() applies the camera's orientation, and drops it
  // One resize only (a second .resize() would replace the first): the 12MP cap and the caller's size, whichever is smaller.
  let tw = w, th = h;
  const k = Math.sqrt(MAX_PIXELS / (w * h));
  if (k < 1) { tw = Math.floor(w * k); th = Math.floor(h * k); }
  if (fit?.cover) out = out.resize({ width: fit.width, height: fit.height, fit: "cover" });
  else {
    const r = Math.min(1, fit?.width ? fit.width / tw : 1, fit?.height ? fit.height / th : 1);
    tw = Math.max(1, Math.floor(tw * r)); th = Math.max(1, Math.floor(th * r));
    if (tw !== w || th !== h) out = out.resize(tw, th);
  }
  if (email) return (pages > 1 ? out.gif() : out.flatten({ background: "#fff" }).jpeg({ quality: 85 })).toBuffer(); // mail apps: no WebP
  return out.webp({ quality: QUALITY }).toBuffer();
}

try {
  const o = JSON.parse(process.argv[2] || "{}");
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks);
  let out;
  try { out = await run(buf, o); }
  catch (e) {
    if (e instanceof Reject) throw e;
    // sharp's build reads a HEIC's header but can't decode it (no HEVC), so decode with heic-convert and carry on.
    const head = await sharp(buf).metadata().catch(() => null);
    if (head && (head.width ?? 0) * (head.height ?? 0) > MAX_HEIC) throw new Reject("That photo has too many pixels. Use a lower-resolution setting.");
    out = await run(Buffer.from(await convert({ buffer: buf, format: "JPEG", quality: 0.95 })), o).catch(() => { throw e; });
  }
  process.stdout.write(out);
} catch (e) {
  console.error(e instanceof Reject ? "reject: " + e.message : String(e?.stack ?? e));
  process.exitCode = e instanceof Reject ? 2 : 1;
}
