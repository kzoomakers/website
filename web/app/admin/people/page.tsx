import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listPeople } from "@/lib/profiles";
import { planNames } from "@/lib/crm";
import People from "./people";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const level = await gate("people", "/admin/people");
  if (!getConfig()) redirect("/admin/system");
  const [initial, levels] = await Promise.all([listPeople(), planNames()]);
  return <People initial={initial} levels={levels} canEdit={level === "write"} />;
}
