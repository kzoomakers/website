import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Page from "./classes";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const level = await gate("people", "/admin/people/classes");
  if (!getConfig()) redirect("/admin/system");
  return <Page canEdit={level === "write"} />;
}
