import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import path from "node:path";
import sharp from "sharp";
import { errMsg } from "./errmsg";
import { hit } from "./limit";
import { MAX_UPLOAD_MB, TOO_LARGE } from "./upload-limit";

// Every uploaded image goes through here: a child process (workers/image-worker.mjs, shipped in the Docker image) decodes it (JPEG, PNG, WebP, GIF, HEIC, AVIF...),
// caps it at 12 megapixels and re-encodes it as a medium-quality WebP (animated stays animated). The child has its own memory, no access to our secrets, and is killed after `timeoutMs`.
// At most 2 run at once and 4 may wait; more are refused as busy, so a burst can't pile up big decodes.
// shortcut: the whole upload is held in memory while it is checked (up to 100 MB); stream to disk first if the machine ever gets tight.
export class ImageError extends Error { // the message is safe to show the member
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
/** The HTTP answer for a failed upload. "Busy" is a 503 with Retry-After, which the browser (lib/upload-client.ts) waits out and retries. */
export const imageFail = (e: unknown) => new Response(errMsg(e), { status: e instanceof ImageError ? e.status : 400, headers: e instanceof ImageError && e.status === 503 ? { "retry-after": "5" } : {} });

export type Processed = { data: Buffer; width: number; height: number; animated: boolean; format: string };
const BUSY = "The server is busy converting other images. Try again in a minute.";
/** Run first in every upload route: refuses an upload with no declared size, one that is too big, or one the server has no room for, then counts it against the caller's hourly allowance.
 * Busy is checked before counting, so the browser's automatic retries of a 503 don't use up the allowance. Returns the refusal, or null to go on. */
export async function uploadGate(req: Request, who: string, perHour = 20): Promise<Response | null> {
  const len = Number(req.headers.get("content-length"));
  if (!len) return new Response("Length required.", { status: 411 });
  if (len > (MAX_UPLOAD_MB + 1) * 1024 * 1024) return new Response(TOO_LARGE, { status: 413 }); // +1: multipart framing
  if (running >= MAX_RUNNING && waiting.length >= MAX_WAITING) return imageFail(new ImageError(BUSY, 503));
  if (!(await hit("img:" + who, perHour, 3600_000))) return new Response("Too many uploads. Try again in a little while.", { status: 429 });
  return null;
}

export type Fit = { width?: number; height?: number; cover?: boolean };
const MAX_OUT = 60 * 1024 * 1024, UNREADABLE = "That image couldn't be read. Use a JPG, PNG, WebP, GIF or HEIC image.";
const MAX_RUNNING = 2, MAX_WAITING = 4;
let running = 0;
const waiting: (() => void)[] = [];

async function slot() {
  if (running < MAX_RUNNING) { running++; return; }
  if (waiting.length >= MAX_WAITING) throw new ImageError(BUSY, 503);
  await new Promise<void>((go) => waiting.push(go)); // the finishing job hands its place straight to us
}
const release = () => { const next = waiting.shift(); if (next) next(); else running--; };

/** WebP out, whatever came in (`email`: JPEG, or GIF if animated, because many mail apps cannot show WebP). `still`: keep only the first frame of an animation. `fit`: shrink to fit inside width x height (or fill it with `cover`). */
export async function processImage(file: Blob | Buffer, o: { still?: boolean; fit?: Fit; email?: boolean; timeoutMs?: number } = {}): Promise<Processed> {
  if ((file instanceof Blob ? file.size : file.length) > MAX_UPLOAD_MB * 1024 * 1024) throw new ImageError(TOO_LARGE, 413);
  await slot();
  try { return await convert(file, { still: !!o.still, fit: o.fit, email: !!o.email }, o.timeoutMs ?? 60_000); } finally { release(); }
}

function convert(file: Blob | Buffer, opts: object, timeoutMs: number): Promise<Processed> {
  return new Promise((resolve, reject) => {
    // env: {} so nothing the web server knows (database URL, keys) is visible to the process that opens untrusted files.
    const p = spawn(process.execPath, [path.join(process.cwd(), "workers/image-worker.mjs"), JSON.stringify(opts)], { stdio: ["pipe", "pipe", "pipe"], env: {} as NodeJS.ProcessEnv });
    const out: Buffer[] = [];
    let size = 0, err = "", done = false;
    const end = (e?: Error, v?: Buffer) => {
      if (done) return;
      done = true; clearTimeout(t); p.kill("SIGKILL");
      if (e || !v) return reject(e ?? new ImageError(UNREADABLE));
      sharp(v).metadata().then((m) => resolve({ data: v, width: m.width ?? 0, height: m.pageHeight ?? m.height ?? 0, animated: (m.pages ?? 1) > 1, format: m.format ?? "webp" }), () => reject(new ImageError(UNREADABLE)));
    };
    const t = setTimeout(() => { console.error("image worker timed out"); end(new ImageError("That image took too long to process. Try a smaller one.")); }, timeoutMs);
    p.stdout.on("data", (c: Buffer) => { out.push(c); if ((size += c.length) > MAX_OUT) end(new ImageError("That image is too large once processed. Use a smaller one.")); });
    p.stderr.on("data", (c: Buffer) => { if (err.length < 4000) err += c; });
    p.on("error", (e) => { console.error("image worker:", e); end(new ImageError(UNREADABLE)); });
    p.on("close", (code) => {
      const why = /^reject: (.+)$/m.exec(err)?.[1];
      if (code === 0 && size) return end(undefined, Buffer.concat(out));
      if (!why) console.error("image worker failed:", err.slice(0, 1000));
      end(new ImageError(why ?? UNREADABLE));
    });
    p.stdin.on("error", () => {}); // the child may exit before reading everything
    if (file instanceof Blob) Readable.fromWeb(file.stream() as any).pipe(p.stdin); else p.stdin.end(file);
  });
}
