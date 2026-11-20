import { NextResponse } from "next/server";
import { revokePresented } from "@/lib/app-tokens";

// POST signs out this device: deletes whichever app tokens the request carries (Authorization and/or X-Admin-Token). Holding the token is the proof.
export async function POST(req: Request) {
  const t = [/^bearer (\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1], req.headers.get("x-admin-token")].filter((x): x is string => !!x);
  await revokePresented(t).catch(() => {});
  return NextResponse.json({ ok: true });
}
