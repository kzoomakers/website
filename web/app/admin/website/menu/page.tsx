import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getMenu } from "@/lib/store";
import MenuEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  await gate("website", "/admin/website/menu");
  if (!getConfig()) redirect("/admin/system");
  return <MenuEditor initial={await getMenu()} />;
}
