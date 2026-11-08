import { NextResponse } from "next/server";
import { detail, summary } from "@/lib/links";
import { editingAllowed } from "@/lib/guard";

export async function GET(req: Request) {
  if (!(await editingAllowed("admin", "read"))) return new NextResponse("not found", { status: 404 });
  const url = new URL(req.url).searchParams.get("url");
  try { return NextResponse.json(url ? await detail(url) : await summary()); } catch { return new NextResponse("Couldn't load.", { status: 500 }); }
}
