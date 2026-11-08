import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Page from "./tools";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const level = await gate("crm", "/admin/crm/tools");
  if (!getConfig()) redirect("/admin/services");
  return <Page canEdit={level === "write"} />;
}
