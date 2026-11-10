import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { baseUrl, publicForms, publicSubscribe } from "@/lib/mail";
import { clientIp } from "@/lib/comments";
import { convert } from "@/lib/ga-attr";

export const dynamic = "force-dynamic";

/** The enabled signup forms the site should show. */
export async function GET() {
  return NextResponse.json(await publicForms().catch(() => []));
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (b?.website) return NextResponse.json({ result: "subscribed" }); // honeypot: bots fill hidden fields, pretend success
  try {
    const ip = clientIp(req);
    const result = await publicSubscribe(Number(b?.form), String(b?.email ?? "").trim(), String(b?.name ?? "").trim(), await baseUrl(req), ip);
    await convert(req, "subscribe");
    return NextResponse.json({ result });
  } catch (e: any) {
    return new NextResponse(errMsg(e), { status: 400 });
  }
}
