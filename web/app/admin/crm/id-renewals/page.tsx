import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { counts, list } from "@/lib/id-card";
import Renewals from "./renewals";

export const dynamic = "force-dynamic";

export default async function IdRenewalsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const level = await gate("crm", "/admin/crm/id-renewals");
  if (!getConfig()) redirect("/admin/services");
  const r = Number((await searchParams).r);
  return <Renewals initial={{ rows: await list("pending"), counts: await counts() }} canEdit={level === "write"} open={Number.isInteger(r) && r > 0 ? r : undefined} />;
}
