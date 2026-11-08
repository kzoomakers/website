import { NextResponse } from "next/server";
import { GO, recordClick } from "@/lib/links";
import { hit } from "@/lib/limit";
import { clientIp } from "@/lib/comments";

// Old redirect pages (/discord-redirect) land here: send them on at once, count the click in the background. Only the fixed links in GO are allowed.
export async function GET(req: Request) {
  const to = GO[new URL(req.url).searchParams.get("l") ?? ""];
  if (!to) return new NextResponse("not found", { status: 404 });
  const ip = clientIp(req);
  if ((await hit("go:" + ip, 20, 60_000)) && (await hit("click:all", 3000, 3600_000))) void recordClick(to, { ip, ua: req.headers.get("user-agent") ?? "", page: req.headers.get("referer") ?? "" }).catch(() => {});
  return NextResponse.redirect(to, 302);
}
