import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Page from "./values";

export const dynamic = "force-dynamic";

export default async function ValuesPage() {
  const level = await gate("crm", "/admin/crm/values");
  if (!getConfig()) redirect("/admin/services");
  return <Page canEdit={level === "write"} />;
}
