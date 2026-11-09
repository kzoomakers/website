import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { editingAllowed } from "@/lib/guard";
import { report } from "@/lib/ga";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await editingAllowed("webmaster", "read"))) return new NextResponse("not found", { status: 404 });
  try { return NextResponse.json(await report(Number(new URL(req.url).searchParams.get("days")))); }
  catch (e: any) { return new NextResponse(errMsg(e), { status: 502 }); }
}
