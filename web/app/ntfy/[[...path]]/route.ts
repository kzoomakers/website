import { NextResponse } from "next/server";
import { authorize, publish, prio, sinceSeq, subscribe, TOPIC_OK, type Fmt, type Filter } from "@/lib/ntfy";
import { hashIp } from "@/lib/comments";

// The ntfy HTTP API (also served at /notify). Point the ntfy app's server URL at https://<site>/ntfy.
export const dynamic = "force-dynamic";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, POST", "access-control-allow-headers": "*" };
const err = (http: number, code: number, error: string) => NextResponse.json({ code, http, error }, { status: http, headers: CORS });
const param = (req: Request, ...names: string[]) => { const u = new URL(req.url).searchParams; for (const n of names) { const v = req.headers.get(n) ?? u.get(n); if (v) return v; } return ""; };
const FORMATS = ["json", "sse", "raw"];

async function handle(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const seg = (await params).path ?? [], m = req.method;
  try {
    if (seg.join("/") === "v1/health") return NextResponse.json({ healthy: true }, { headers: CORS });
    if (!seg.length) { // POST / with a JSON body naming the topic
      if (m !== "POST" && m !== "PUT") return new NextResponse("ntfy-compatible notification server. Publish with PUT /{topic}, subscribe with GET /{topic}/json\n", { headers: CORS });
      const b = await req.json().catch(() => null);
      if (!b || typeof b.topic !== "string" || !TOPIC_OK.test(b.topic)) return err(400, 40010, "invalid request: topic invalid");
      return await send(req, b.topic, b);
    }
    const action = seg[1];
    if (seg.length > 2 || (seg[0].includes(",") && !FORMATS.includes(action))) return err(404, 40401, "page not found");
    const topics = seg[0].split(",");
    if (topics.length > 20 || !topics.every((t) => TOPIC_OK.test(t))) return err(400, 40009, "invalid request: topic invalid");
    if (m === "OPTIONS") return new NextResponse(null, { headers: CORS });
    if (FORMATS.includes(action) && m === "GET") {
      const who = await authorize(req, topics, false);
      if (!who) return err(403, 40301, "forbidden");
      const poll = ["1", "true", "yes"].includes(param(req, "x-poll", "poll", "po").toLowerCase());
      const since = await sinceSeq(topics, param(req, "x-since", "since", "si"), poll);
      if (since === null) return err(400, 40008, "invalid request: since parameter is invalid");
      const u = new URL(req.url).searchParams, has = (...n: string[]) => n.some((k) => req.headers.has(k) || u.has(k)), list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
      const filter: Filter = { id: param(req, "x-id", "id") || undefined, message: has("x-message", "message", "m") ? param(req, "x-message", "message", "m") : undefined, title: has("x-title", "title", "t") ? param(req, "x-title", "title", "t") : undefined,
        priority: list(param(req, "x-priority", "priority", "prio", "p")).map(prio), tags: list(param(req, "x-tags", "tags", "tag", "ta")) }; // the apps use these to fetch one message after a push (?id=)
      return await subscribe(req, topics, action as Fmt, since, poll, who, hashIp(req), filter);
    }
    if (action === "auth") return (await authorize(req, topics, false)) ? NextResponse.json({ success: true }, { headers: CORS }) : err(403, 40301, "forbidden");
    if (!action && m === "GET") return new NextResponse(`Topic ${seg[0]}. Subscribe with GET /${seg[0]}/json, publish with PUT /${seg[0]}\n`, { headers: CORS });
    if ((!action && (m === "PUT" || m === "POST")) || (["publish", "send", "trigger"].includes(action) && (m === "GET" || m === "POST" || m === "PUT"))) {
      if (topics.length > 1) return err(400, 40009, "invalid request: topic invalid");
      return await send(req, seg[0], null);
    }
    return err(404, 40401, "page not found");
  } catch (e: any) {
    if (e.message === "unknown topic") return err(404, 40402, "topic not found");
    if (e.message === "not configured") return err(503, 50301, "not available");
    if (e.message?.startsWith("limit reached")) return err(429, 42901, e.message);
    console.error("ntfy:", e);
    return err(500, 50001, "internal server error");
  }
}

/** Publish from headers/query plus the body (plain text), or from a JSON object (`j`). */
async function send(req: Request, topic: string, j: any) {
  const who = await authorize(req, [topic], true);
  if (!who) return err(403, 40301, "forbidden");
  let body = "";
  if (!j && req.method !== "GET") { body = await req.text(); if (Buffer.byteLength(body) > 4096) return err(413, 41301, "attachment too large: message bodies are limited to 4096 bytes"); }
  const m = j ?? { title: param(req, "x-title", "title", "t"), message: param(req, "x-message", "message", "m") || body, priority: param(req, "x-priority", "priority", "prio", "p"),
    tags: param(req, "x-tags", "tags", "tag", "ta"), click: param(req, "x-click", "click"), icon: param(req, "x-icon", "icon") };
  const actions = j?.actions ?? (() => { const a = param(req, "x-actions", "actions", "action"); try { return a.trim().startsWith("[") ? JSON.parse(a) : undefined; } catch { return undefined; } })();
  return NextResponse.json(await publish(topic, { ...m, priority: j ? (typeof j.priority === "number" ? j.priority : prio(j.priority)) : prio(m.priority), actions }, who, hashIp(req)), { headers: CORS });
}

export { handle as GET, handle as POST, handle as PUT, handle as OPTIONS };
