import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { captchaCfg, setCaptcha } from "@/lib/captcha";

// Google reCAPTCHA keys. Admin section. POST { site, secret } (blank site turns it off; blank secret keeps the saved one).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!(await editingAllowed("admin", "write", "setup"))) return new NextResponse("not found", { status: 404 });
  try {
    await setCaptcha(a?.site, a?.secret);
    await logAudit(await actor(), "captcha.keys", a?.site ? "set" : "removed");
    const c = await captchaCfg();
    return NextResponse.json({ site: c?.site ?? "", hasSecret: !!c });
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
