// Browser side of uploads. The server converts two images at a time and answers 503 (with Retry-After) when its queue is full,
// so the browser waits and tries again instead of failing: a big batch just takes as long as it takes.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POSTs the form data; a 503 "busy" answer is retried (for up to `waitMs`). Returns null when the server can't be reached. */
export async function sendUpload(url: string, body: FormData, waitMs = 10 * 60_000): Promise<Response | null> {
  const stop = Date.now() + waitMs;
  for (;;) {
    const r = await fetch(url, { method: "POST", body }).catch(() => null);
    if (r?.status !== 503 || Date.now() > stop) return r;
    await sleep((Number(r.headers.get("retry-after")) || 5) * 1000);
  }
}

/** Runs `one` over `files` two at a time (the server's limit), keeping the order, and reports progress. A failure is returned as an Error, not thrown, so one bad file doesn't stop the rest. */
export async function uploadBatch<T>(files: File[], one: (f: File) => Promise<T>, progress?: (done: number, total: number) => void): Promise<(T | Error)[]> {
  const out: (T | Error)[] = new Array(files.length);
  let next = 0, done = 0;
  const lane = async () => {
    while (next < files.length) {
      const i = next++;
      out[i] = await one(files[i]).catch((e) => (e instanceof Error ? e : new Error(String(e))));
      progress?.(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, files.length) }, lane));
  return out;
}
