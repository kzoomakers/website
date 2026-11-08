import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { counts, listApplicants } from "@/lib/approvals";
import Approvals from "./approvals";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const level = await gate("crm", "/admin/crm/approvals");
  if (!getConfig()) redirect("/admin/services");
  const u = Number((await searchParams).u);
  return <Approvals initial={{ rows: await listApplicants("pending"), counts: await counts() }} canEdit={level === "write"} open={Number.isInteger(u) && u > 0 ? u : undefined} />;
}
