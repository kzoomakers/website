import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { listUsers, setAccess } from "@/lib/users";

const off = () => new NextResponse("not found", { status: 404 });

// GET ?q=search lists site accounts and their access.
export async function GET(req: Request) {
  if (!(await editingAllowed("admin", "read"))) return off();
  return NextResponse.json(await listUsers(new URL(req.url).searchParams.get("q") ?? ""));
}

// PUT { userId, section, level: "read" | "write" | null } (null removes access).
export async function PUT(req: Request) {
  if (!(await editingAllowed("admin"))) return off();
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.userId) || typeof b?.section !== "string") return new NextResponse("bad request", { status: 400 });
  const who = await actor();
  try {
    const email = await setAccess(b.userId, b.section, b.level ?? null, who);
    if (!email) return off();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message, { status: 400 });
  }
}
