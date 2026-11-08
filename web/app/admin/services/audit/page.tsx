import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Audit from "./audit";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await gate("admin", "/admin/services/audit");
  if (!getConfig()) redirect("/admin/services");
  return <Audit />;
}
