import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { timeline } from "@/lib/tours";
import Timeline from "./timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  await gate("tours", "/admin/tours/timeline");
  if (!getConfig()) redirect("/admin/services");
  return <Timeline initial={await timeline({})} />;
}
