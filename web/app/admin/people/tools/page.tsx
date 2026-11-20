import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Page from "./tools";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const level = await gate("people", "/admin/people/tools");
  if (!getConfig()) redirect("/admin/system");
  return <Page canEdit={level === "write"} />;
}
