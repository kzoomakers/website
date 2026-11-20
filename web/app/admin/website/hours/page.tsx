import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getHours } from "@/lib/store";
import HoursEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  await gate("website", "/admin/website/hours");
  if (!getConfig()) redirect("/admin/system");
  return <HoursEditor initial={await getHours()} />;
}
