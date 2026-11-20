import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Seal from "../seal";
import { sealInfo } from "@/lib/pdf-seal";

export const dynamic = "force-dynamic";

export default async function SealPage() {
  if ((await gate("system", "/admin/system/seal")) !== "write") redirect("/admin");
  if (!getConfig()) redirect("/admin/system");
  return <><h1>Signing certificate</h1><Seal initial={await sealInfo()} /></>;
}
