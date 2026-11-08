import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listUsers } from "@/lib/users";
import Users from "./users";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const level = await gate("admin", "/admin/users");
  if (!getConfig()) redirect("/admin/services");
  return <Users initial={await listUsers("")} canEdit={level === "write"} />;
}
