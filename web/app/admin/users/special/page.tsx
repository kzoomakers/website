import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { conn } from "@/lib/db";
import { SPECIAL, specialList } from "@/lib/waiver";
import Special from "./special";

export const dynamic = "force-dynamic";

export default async function SpecialPage() {
  const level = await gate("admin", "/admin/users/special");
  if (!getConfig()) redirect("/admin/services");
  const admins = (await (await conn()).query("SELECT DISTINCT u.email, u.name FROM site_users u JOIN user_perms p ON p.user_id = u.id WHERE u.disabled_at IS NULL ORDER BY u.name")).rows as { email: string; name: string }[];
  return <Special perms={Object.entries(SPECIAL).map(([k, label]) => ({ k, label }))} initial={await specialList()} admins={admins} canEdit={level === "write"} />;
}
