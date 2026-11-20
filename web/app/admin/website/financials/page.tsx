import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  await gate("website", "/admin/website/financials");
  if (!getConfig()) redirect("/admin/system");
  return <Editor />;
}
