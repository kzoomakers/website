import { NextResponse } from "next/server";
import { consumeCode } from "@/lib/readers";
import { hashIp } from "@/lib/comments";

// POST { email, code, device? } -> { token } (a year, this device only; send it as "Authorization: Bearer <token>").
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const token = typeof b?.email === "string" && typeof b?.code === "string" ? await consumeCode(b.email, b.code.trim(), String(b.device ?? ""), hashIp(req)).catch(() => null) : null;
  return token ? NextResponse.json({ token }) : new NextResponse("That code didn't work. Check it, or ask for a new one.", { status: 401 });
}
