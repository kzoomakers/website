import { redirect } from "next/navigation";
import { gate, me } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listBlocks } from "@/lib/tours";
import Availability from "./availability";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  await gate("tours", "/admin/tours/availability");
  if (!getConfig()) redirect("/admin/services");
  const m = await me();
  return <Availability initial={await listBlocks(false)} email={m?.email.includes("@") ? m.email : ""} name={m?.name ?? ""} />;
}
