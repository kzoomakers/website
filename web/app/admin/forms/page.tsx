import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listMessages, messageCounts } from "@/lib/contact";
import Inbox from "./inbox";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/forms");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  const counts = await messageCounts(), tab = counts.held ? "held" : "all";
  return <Inbox initial={await listMessages(tab)} tab={tab} counts={counts} />;
}
