import { NextResponse } from "next/server";
import { editingAllowed } from "@/lib/guard";
import { listPeople } from "@/lib/profiles";

// GET ?q=search lists site accounts for CRM.
export async function GET(req: Request) {
  if (!(await editingAllowed("crm", "read"))) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(await listPeople(new URL(req.url).searchParams.get("q") ?? ""));
}
