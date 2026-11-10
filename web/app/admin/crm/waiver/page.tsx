import { redirect } from "next/navigation";
import { canSpecial, gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getDraft, listVersions } from "@/lib/waiver";
import { aiReady } from "@/lib/ai";
import WaiverAdmin from "./waiver-admin";

export const dynamic = "force-dynamic";

export default async function WaiverPage() {
  const level = await gate("crm", "/admin/crm/waiver");
  if (!getConfig()) redirect("/admin/services");
  return <WaiverAdmin initial={await listVersions()} draft={await getDraft("member")} canEdit={level === "write"} canPublish={level === "write" && (await canSpecial("agreement.member"))} ai={level === "write" && (await aiReady("agreement-summary").catch(() => false))} />;
}
