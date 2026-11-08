import { NextResponse } from "next/server";
import { GO, recordClick } from "@/lib/links";
import { hit } from "@/lib/limit";

// Old redirect pages (/discord-redirect) land here: send them on at once, count the click in the background. Only the fixed links in GO are allowed.
export async function GET(req: Request) {
  const to = GO[new URL(req.url).searchParams.get("l") ?? ""];
  if (!to) return new NextResponse("not found", { status: 404 });
  const ip = req.headers.get("fly-client-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  if (hit("go:" + ip, 20, 60_000) && hit("click:all", 3000, 3600_000)) void recordClick(to, { ip, ua: req.headers.get("user-agent") ?? "", page: req.headers.get("referer") ?? "" }).catch(() => {});
  return NextResponse.redirect(to, 302);
}
