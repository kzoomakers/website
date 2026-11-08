import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getHours } from "@/lib/store";
import HoursEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  await gate("webmaster", "/admin/webmaster/hours");
  if (!getConfig()) redirect("/admin/services");
  return <HoursEditor initial={await getHours()} />;
}
