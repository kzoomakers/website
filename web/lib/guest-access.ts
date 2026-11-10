import { NextResponse } from "next/server";
import { clientIp } from "./comments";
import { hit } from "./limit";
import { currentMember } from "./readers";
import { getGuest, guestOfLink, type Guest } from "./guests";

/** Who is asking about which guest: the host member (signed in, `g=<id>`) or the guest themself (`t=<private link token>`). Anyone else gets the same plain "not found". */
export async function access(req: Request, body?: any): Promise<{ g: Guest; host: boolean; hostId: number | null } | NextResponse> {
  const q = new URL(req.url).searchParams, t = String(q.get("t") ?? body?.t ?? ""), gid = Number(q.get("g") ?? body?.g);
  if (t) {
    if (!(await hit("guest-link:" + clientIp(req), 120, 60_000))) return new NextResponse("Too many tries. Wait a minute and try again.", { status: 429 });
    const id = await guestOfLink(t).catch(() => null), g = id ? await getGuest(id) : null;
    return g ? { g, host: false, hostId: null } : new NextResponse("This link has expired. Ask the member who brought you for a new QR code.", { status: 404 });
  }
  const m = await currentMember().catch(() => null);
  if (!m) return new NextResponse("Sign in first.", { status: 401 });
  const g = Number.isInteger(gid) ? await getGuest(gid) : null;
  return g && g.host_id === m.id ? { g, host: true, hostId: m.id } : new NextResponse("not found", { status: 404 });
}
export const isRes = (x: unknown): x is NextResponse => x instanceof NextResponse;
