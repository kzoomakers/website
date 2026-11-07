import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getHours } from "@/lib/store";
import HoursEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/webmaster/hours");
  if (!getConfig()) redirect("/webmaster/setup");
  return <HoursEditor initial={await getHours()} />;
}
