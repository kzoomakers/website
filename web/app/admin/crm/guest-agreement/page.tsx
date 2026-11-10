import { redirect } from "next/navigation";
import { canSpecial, gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getDraft, listVersions } from "@/lib/waiver";
import { aiReady } from "@/lib/ai";
import WaiverAdmin from "../waiver/waiver-admin";

export const dynamic = "force-dynamic";

export default async function GuestAgreementPage() {
  const level = await gate("crm", "/admin/crm/guest-agreement");
  if (!getConfig()) redirect("/admin/services");
  return <WaiverAdmin kind="guest" initial={await listVersions("guest")} draft={await getDraft("guest")} canEdit={level === "write"} canPublish={level === "write" && (await canSpecial("agreement.guest"))} ai={level === "write" && (await aiReady("agreement-summary").catch(() => false))} />;
}
