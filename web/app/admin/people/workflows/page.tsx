import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { features } from "@/lib/features";
import Workflows from "./workflows";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  if ((await gate("system", "/admin/people/workflows")) !== "write") redirect("/admin");
  if (!getConfig()) redirect("/admin/system");
  return <Workflows initial={await features()} />;
}
