import { spawn } from "node:child_process";
import path from "node:path";

export type Extract = { pages: number; text: string; thumb: string };
/** Page count, text and a page-1 thumbnail (base64 WebP, may be empty) of a PDF, read by a child process with an empty environment, 30s limit. Throws if the PDF can't be read. */
export function extractPdf(buf: Buffer, timeoutMs = 30_000): Promise<Extract> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(process.cwd(), "workers/pdf-worker.mjs")], { stdio: ["pipe", "pipe", "ignore"], env: {} as NodeJS.ProcessEnv });
    const out: Buffer[] = [];
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("That PDF took too long to read.")); }, timeoutMs);
    p.stdout.on("data", (c) => out.push(c));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("That PDF couldn't be read. It may be damaged or password-protected."));
      try { resolve(JSON.parse(Buffer.concat(out).toString())); } catch { reject(new Error("That PDF couldn't be read.")); }
    });
    p.stdin.on("error", () => {}); // the child may exit before it has read everything
    p.stdin.end(buf);
  });
}
