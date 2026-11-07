import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getMenu } from "@/lib/store";
import MenuEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/webmaster/menu");
  if (!getConfig()) redirect("/webmaster/setup");
  return <MenuEditor initial={await getMenu()} />;
}
