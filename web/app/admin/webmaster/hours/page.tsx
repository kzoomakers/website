import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getHours } from "@/lib/store";
import HoursEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster/hours");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <HoursEditor initial={await getHours()} />;
}
