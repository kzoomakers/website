import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { exportBlog, importBlog } from "@/lib/blog-io";
import { actor, editingAllowed } from "@/lib/guard";

export const dynamic = "force-dynamic";

// GET ?files=0 downloads import.json (the whole blog; images included unless files=0).
export async function GET(req: Request) {
  if (!(await editingAllowed("blog", "read", "posts"))) return new NextResponse("not found", { status: 404 });
  const body = JSON.stringify(await exportBlog(new URL(req.url).searchParams.get("files") !== "0"));
  return new NextResponse(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="import.json"` } });
}

// POST the file's JSON as the request body.
export async function POST(req: Request) {
  if (!(await editingAllowed("blog", "write", "posts"))) return new NextResponse("not found", { status: 404 });
  const b = await req.json().catch(() => null);
  if (!b) return new NextResponse("That file isn't valid JSON.", { status: 400 });
  try {
    return NextResponse.json(await importBlog(b, await actor()));
  } catch (e: any) {
    return new NextResponse(errMsg(e), { status: 400 });
  }
}
