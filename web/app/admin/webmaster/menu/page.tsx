import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getMenu } from "@/lib/store";
import MenuEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  await gate("webmaster", "/admin/webmaster/menu");
  if (!getConfig()) redirect("/admin/services");
  return <MenuEditor initial={await getMenu()} />;
}
