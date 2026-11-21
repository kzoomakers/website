import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Link from "next/link";
import { features } from "@/lib/features";
import Page from "./classes";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const level = await gate("people", "/admin/people/classes");
  if (!getConfig()) redirect("/admin/system");
  const off = !(await features()).classes;
  return <>{off && <p className="card" role="status" style={{ padding: 12 }}>Classes are switched off, so members can't see or join them and announcements aren't sent. Existing classes and sign-ups are kept. <Link href="/admin/people/workflows">Change in Workflows</Link></p>}<Page canEdit={level === "write"} /></>;
}
