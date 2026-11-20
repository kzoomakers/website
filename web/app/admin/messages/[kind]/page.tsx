import { notFound, redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listMessages, messageCounts, type Kind } from "@/lib/contact";
import Inbox from "../inbox";

export const dynamic = "force-dynamic";

export default async function KindPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!["contact", "board", "donation"].includes(kind)) notFound();
  await gate("messages", `/admin/messages/${kind}`);
  if (!getConfig()) redirect("/admin/system");
  const counts = await messageCounts(kind), tab = counts.held ? "held" : "all";
  return <Inbox key={kind} initial={await listMessages(tab, kind)} tab={tab} counts={counts} fixed={kind as Kind} />;
}
