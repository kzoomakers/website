import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { mapsKey, setMapsKey } from "@/lib/maps-key";

// Google Maps API key. Admin section. POST { key } (blank removes it).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("admin", "write", "setup"))) return new NextResponse("not found", { status: 404 });
  try {
    await setMapsKey(a?.key);
    await logAudit(await actor(), "maps.key", a?.key ? "set" : "removed");
    return NextResponse.json({ key: await mapsKey() });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
