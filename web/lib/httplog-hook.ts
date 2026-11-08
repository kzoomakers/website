import http from "node:http";
import { getToken } from "next-auth/jwt";
import { toRow, record } from "./httplog";
import { staticPath, statusOf, webLike } from "./httplog-util";
import { COOKIE_NAME, cookieUserId } from "./readers";

const GOOGLE = ["__Secure-authjs.session-token", "authjs.session-token"];
const cookieOf = (header: string, name: string) => header.split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.slice(1).join("=");

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
      const t = await getToken({ req: { headers: new Headers({ cookie }) } as any, secret: process.env.AUTH_SECRET, secureCookie: secure.startsWith("__Secure-"), salt: secure }).catch(() => null);
      if (t?.email) row.user = `google:${t.email}`;
    }
  } catch { /* keep the row without a user */ }
  record(row);
}
