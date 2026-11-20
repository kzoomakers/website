import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listMessages, messageCounts } from "@/lib/contact";
import Inbox from "./inbox";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  await gate("messages", "/admin/messages");
  if (!getConfig()) redirect("/admin/system");
  const counts = await messageCounts(), tab = counts.held ? "held" : "all";
  return <Inbox initial={await listMessages(tab)} tab={tab} counts={counts} />;
}
