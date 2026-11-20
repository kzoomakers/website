import { NextResponse } from "next/server";
import { adminTokenFor } from "@/lib/mobile";
import { hit } from "@/lib/limit";
import { hashIp } from "@/lib/comments";

// POST { idToken, device? } (Google ID token from the app) -> { token } (send it as "X-Admin-Token") for allow-listed admins only.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.idToken !== "string") return new NextResponse("bad request", { status: 400 });
  if (!(await hit("gadm:" + hashIp(req), 20, 600_000, true))) return new NextResponse("Too many attempts. Try again in a few minutes.", { status: 429 });
  const token = await adminTokenFor(b.idToken, String(b.device ?? "")).catch(() => null);
  return token ? NextResponse.json({ token }) : new NextResponse("That Google account isn't an admin here.", { status: 403 });
}
