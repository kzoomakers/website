import http from "node:http";
import { getToken } from "next-auth/jwt";
import { toRow, record } from "./httplog";
import { staticPath, statusOf, webLike } from "./httplog-util";
import { COOKIE_NAME, cookieUserId } from "./readers";

const GOOGLE = ["__Secure-authjs.session-token", "authjs.session-token"];
const cookieOf = (header: string, name: string) => header.split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.slice(1).join("=");

// The same signed-in person sends the same cookie on every request; decrypting it each time is wasted CPU. Kept 60 s, at most 500 cookies (the cookie itself is the proof, so nothing is trusted that wasn't).
const emails = new Map<string, { email: string | null; at: number }>();
const emailOf = async (cookie: string, secure: string) => {
  const key = cookieOf(cookie, secure) ?? "", hit = emails.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.email;
  const t = await getToken({ req: { headers: new Headers({ cookie }) } as any, secret: process.env.AUTH_SECRET!, secureCookie: secure.startsWith("__Secure-"), salt: secure }).catch(() => null);
  if (emails.size >= 500) emails.clear();
  emails.set(key, { email: t?.email ?? null, at: Date.now() });
  return t?.email ?? null;
};

/** Logs every request when its response ends, so the row can carry the status code (middleware runs before the response exists).
 *  Hooks the HTTP server's "request" event; never blocks or changes a request, and a failure here only loses a log row. */
export function installHttpLog() {
  const g = globalThis as unknown as { httplogHooked?: boolean };
  if (g.httplogHooked) return;
  g.httplogHooked = true;
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (this: http.Server, ev: string, ...a: any[]) {
    if (ev === "request") {
      const [req, res] = a as [http.IncomingMessage, http.ServerResponse];
      try {
        const w = webLike(req), path = new URL(w.url).pathname;
        if (!staticPath(path)) {
          const row = toRow(w as unknown as Request);
          res.once("close", () => {
            row.status = statusOf(res.statusCode, res.writableFinished);
            finish(row, String(req.headers.cookie ?? "")).catch(() => {});
          });
        }
      } catch { /* logging must never break a page */ }
    }
    return emit.apply(this, [ev, ...a] as unknown as Parameters<typeof emit>);
  } as typeof emit;
}

async function finish(row: ReturnType<typeof toRow>, cookie: string) {
  try {
    const site = cookieUserId(cookieOf(cookie, COOKIE_NAME));
    if (site) row.user = `site:${site}`; // resolved to the account's email when the batch is written
    const secure = GOOGLE.find((n) => cookieOf(cookie, n));
    if (secure && process.env.AUTH_SECRET) {
      const email = await emailOf(cookie, secure);
      if (email) row.user = `google:${email}`;
    }
  } catch { /* keep the row without a user */ }
  record(row);
}
