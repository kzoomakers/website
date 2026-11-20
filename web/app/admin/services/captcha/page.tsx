import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Captcha from "../captcha";
import { captchaCfg } from "@/lib/captcha";

export const dynamic = "force-dynamic";

export default async function CaptchaPage() {
  if ((await gate("admin", "/admin/services/captcha")) !== "write") redirect("/admin");
  if (!getConfig()) redirect("/admin/services");
  return <><h1>Spam protection</h1><Captcha initial={await (async () => { const c = await captchaCfg(); return { site: c?.site ?? "", hasSecret: !!c }; })()} /></>;
}
