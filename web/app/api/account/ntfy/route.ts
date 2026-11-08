import { NextResponse } from "next/server";
import { me } from "@/lib/guard";
import { createToken, deleteToken, ensureUserTopic, listLinks, listTokens } from "@/lib/ntfy";
import { logAudit } from "@/lib/store";

// A signed-in person's own notification topic and personal access tokens (a token can only publish to that one topic).
export const dynamic = "force-dynamic";
const who = async () => { const m = await me(); return m?.email.includes("@") ? m.email.toLowerCase() : null; };

export async function GET() {
  const email = await who();
  if (!email) return new NextResponse("sign in", { status: 401 });
  const topic = await ensureUserTopic(email);
  return NextResponse.json({ email, topic, sources: (await listLinks(topic)).filter((l) => l.dir === "from").map((l) => l.other), tokens: await listTokens(email) });
}

// POST { label, expires } makes a token (shown once); DELETE ?hash= revokes one of your own.
export async function POST(req: Request) {
  const email = await who(), b = await req.json().catch(() => null);
  if (!email) return new NextResponse("sign in", { status: 401 });
  if ((await listTokens(email)).length >= 10) return new NextResponse("You have 10 tokens already. Revoke one first.", { status: 400 });
  try {
    const topic = await ensureUserTopic(email), token = await createToken({ label: String(b?.label ?? "").trim() || "My token", topics: [topic], scopes: ["publish"], expires: b?.expires ?? "never" }, email, email);
    await logAudit(email, "ntfy.myToken", topic);
    return NextResponse.json({ token });
  } catch (e: any) { return new NextResponse(e.message, { status: 400 }); }
}
export async function DELETE(req: Request) {
  const email = await who();
  if (!email) return new NextResponse("sign in", { status: 401 });
  await deleteToken(new URL(req.url).searchParams.get("hash") ?? "", email);
  return NextResponse.json({ ok: true });
}
