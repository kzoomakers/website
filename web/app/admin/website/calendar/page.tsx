import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getCalUrl } from "@/lib/store";
import CalendarAdmin from "./editor";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await gate("website", "/admin/website/calendar");
  if (!getConfig()) redirect("/admin/system");
  return <CalendarAdmin initial={await getCalUrl()} />;
}
