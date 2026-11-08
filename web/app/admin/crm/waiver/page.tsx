import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listVersions } from "@/lib/waiver";
import WaiverAdmin from "./waiver-admin";

export const dynamic = "force-dynamic";

export default async function WaiverPage() {
  const level = await gate("crm", "/admin/crm/waiver");
  if (!getConfig()) redirect("/admin/services");
  return <WaiverAdmin initial={await listVersions()} canEdit={level === "write"} />;
}
