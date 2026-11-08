import { redirect } from "next/navigation";
import { gate, me } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listRequests } from "@/lib/tours";
import Walkups from "./walkups";

export const dynamic = "force-dynamic";

export default async function WalkupsPage() {
  await gate("tours", "/admin/tours/walkups");
  if (!getConfig()) redirect("/admin/services");
  const m = await me();
  return <Walkups initial={await listRequests(false)} email={m?.email.includes("@") ? m.email : ""} name={m?.name ?? ""} />;
}
