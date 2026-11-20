import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import MembershipClasses from "../../services/membership-classes";
import { membershipClasses } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function MembershipClassesPage() {
  await gate("crm", "/admin/crm/membership-classes");
  if (!getConfig()) redirect("/admin/services");
  return <><h1>Membership classes</h1><MembershipClasses initial={await membershipClasses()} /></>;
}
