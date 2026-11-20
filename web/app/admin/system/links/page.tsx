import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Links from "./links";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  await gate("system", "/admin/system/links");
  if (!getConfig()) redirect("/admin/system");
  return <Links />;
}
