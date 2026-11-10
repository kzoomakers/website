import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { adminList, adminVisits, getCfg } from "@/lib/guests";
import GuestsAdmin from "./guests-admin";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const level = await gate("crm", "/admin/crm/guests");
  if (!getConfig()) redirect("/admin/services");
  return <GuestsAdmin initial={await adminList("")} visits={await adminVisits()} cfg={await getCfg()} canEdit={level === "write"} />;
}
