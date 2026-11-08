import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { aiReady } from "@/lib/ai";
import { state } from "@/lib/handbook";
import Updates from "./updates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Handbook updates | Admin" };

export default async function HandbookUpdatesPage() {
  const level = await gate("webmaster", "/admin/webmaster/handbook-updates");
  if (!getConfig()) redirect("/admin/services");
  return <Updates initial={await state()} canEdit={level === "write"} ai={level === "write" && (await aiReady("handbook-summary").catch(() => false))} />;
}
