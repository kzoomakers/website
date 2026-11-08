import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listPeople } from "@/lib/profiles";
import People from "./people";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const level = await gate("crm", "/admin/crm");
  if (!getConfig()) redirect("/admin/services");
  return <People initial={await listPeople("")} canEdit={level === "write"} />;
}
