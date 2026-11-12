import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listTemplates } from "@/lib/sign";
import Templates from "./templates";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await gate("board", "/admin/esign/templates");
  if (!getConfig()) redirect("/admin/services");
  return <Templates initial={await listTemplates()} />;
}
