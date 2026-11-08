import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listTopics } from "@/lib/ntfy";
import Ntfy from "./ntfy";

export const dynamic = "force-dynamic";

export default async function NtfyPage() {
  await gate("admin", "/admin/services/ntfy");
  if (!getConfig()) redirect("/admin/services");
  return <Ntfy initial={JSON.parse(JSON.stringify(await listTopics()))} />;
}
