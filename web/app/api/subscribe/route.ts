import { NextResponse } from "next/server";
import { baseUrl, publicForms, publicSubscribe } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** The enabled signup forms the site should show. */
export async function GET() {
  return NextResponse.json(await publicForms().catch(() => []));
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (b?.website) return NextResponse.json({ result: "subscribed" }); // honeypot: bots fill hidden fields, pretend success
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "?";
    return NextResponse.json({ result: await publicSubscribe(Number(b?.form), String(b?.email ?? "").trim(), String(b?.name ?? "").trim(), await baseUrl(req), ip) });
  } catch (e: any) {
    return new NextResponse(e.message ?? "failed", { status: 400 });
  }
}
