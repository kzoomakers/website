import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getRobots } from "@/lib/store";
import RobotsEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function RobotsPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster/robots");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <RobotsEditor initial={await getRobots()} />;
}
