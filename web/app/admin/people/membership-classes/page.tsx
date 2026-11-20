import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import MembershipClasses from "../../system/membership-classes";
import { membershipClasses } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function MembershipClassesPage() {
  if ((await gate("system", "/admin/people/membership-classes")) !== "write") redirect("/admin");
  if (!getConfig()) redirect("/admin/system");
  return <><h1>Membership classes</h1><MembershipClasses initial={await membershipClasses()} /></>;
}
