import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { overview } from "@/lib/tours-notify";
import Notifications from "./notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await gate("tours", "/admin/tours/notifications");
  if (!getConfig()) redirect("/admin/services");
  return <Notifications initial={await overview()} />;
}
