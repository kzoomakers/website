import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getRobots } from "@/lib/store";
import RobotsEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function RobotsPage() {
  await gate("website", "/admin/website/robots");
  if (!getConfig()) redirect("/admin/system");
  return <RobotsEditor initial={await getRobots()} />;
}
