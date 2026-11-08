import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getCalUrl } from "@/lib/store";
import CalendarAdmin from "./editor";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await gate("webmaster", "/admin/webmaster/calendar");
  if (!getConfig()) redirect("/admin/services");
  return <CalendarAdmin initial={await getCalUrl()} />;
}
