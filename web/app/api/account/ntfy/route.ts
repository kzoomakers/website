import { NextResponse } from "next/server";
import { me } from "@/lib/guard";
import { addExtraTopic, createToken, deleteExtraTopic, deleteToken, ensureUserTopic, listExtraTopics, listLinks, listTokens, publish } from "@/lib/ntfy";
import { logAudit } from "@/lib/store";

// A signed-in person's own notification topics (the main one plus extras named <main>-<name>) and their personal access tokens.
export const dynamic = "force-dynamic";
const who = async () => { const m = await me(); return m?.email.includes("@") ? m.email.toLowerCase() : null; };
const ownTopics = async (email: string) => [await ensureUserTopic(email), ...(await listExtraTopics(email)).map((t) => t.name as string)];

export async function GET() {
  const email = await who();
  if (!email) return new NextResponse("sign in", { status: 401 });
  const topic = await ensureUserTopic(email);
  return NextResponse.json({ email, topic, extras: (await listExtraTopics(email)).map((t) => t.name), sources: (await listLinks(topic)).filter((l) => l.dir === "from").map((l) => l.other), tokens: await listTokens(email) });
}

// POST { op: "token" | "addTopic" | "deleteTopic" | "test", ... }
export async function POST(req: Request) {
  const email = await who(), b = await req.json().catch(() => null);
  if (!email) return new NextResponse("sign in", { status: 401 });
  try {
    const mine = await ownTopics(email);
    switch (b?.op) {
      case "addTopic": { const name = await addExtraTopic(email, String(b.name ?? "")); await logAudit(email, "ntfy.myTopic", name); return NextResponse.json({ name }); }
      case "deleteTopic": await deleteExtraTopic(email, String(b.name)); await logAudit(email, "ntfy.myTopicDelete", String(b.name)); return NextResponse.json({ ok: true });
      case "test": {
        const name = String(b.name), text = String(b.message ?? "").trim();
        if (!mine.includes(name)) throw new Error("No such topic.");
        if (!text) throw new Error("Enter a message to send.");
        await publish(name, { title: "Test", message: text }, email);
        return NextResponse.json({ ok: true });
      }
      default: { // token
        if ((await listTokens(email)).length >= 10) throw new Error("You have 10 tokens already. Revoke one first.");
        const topics: string[] = Array.isArray(b?.topics) && b.topics.length ? b.topics.map(String) : [mine[0]];
        if (!topics.every((t) => mine.includes(t))) throw new Error("You can only use your own topics.");
        const scopes = (["read", "publish"] as const).filter((s) => b?.scopes?.includes(s));
        if (!scopes.length) throw new Error("Pick read, write, or both.");
        const token = await createToken({ label: String(b?.label ?? "").trim() || "My token", topics, scopes, expires: b?.expires ?? "never" }, email, email);
        await logAudit(email, "ntfy.myToken", topics.join(","));
        return NextResponse.json({ token });
      }
    }
  } catch (e: any) { return new NextResponse(e.message, { status: 400 }); }
}
export async function DELETE(req: Request) {
  const email = await who();
  if (!email) return new NextResponse("sign in", { status: 401 });
  await deleteToken(new URL(req.url).searchParams.get("hash") ?? "", email);
  return NextResponse.json({ ok: true });
}
