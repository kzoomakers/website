import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getCalUrl } from "@/lib/store";
import CalendarAdmin from "./editor";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster/calendar");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <CalendarAdmin initial={await getCalUrl()} />;
}
