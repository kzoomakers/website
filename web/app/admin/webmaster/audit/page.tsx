import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Audit from "./audit";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster/audit");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <Audit />;
}
