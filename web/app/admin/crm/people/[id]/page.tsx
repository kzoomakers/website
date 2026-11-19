import { notFound, redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getProfile } from "@/lib/profiles";
import { hasRoster } from "@/lib/profiles";
import Member from "./member";

export const dynamic = "force-dynamic";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const level = await gate("crm", "/admin/crm/people/" + id);
  if (!getConfig()) redirect("/admin/services");
  const profile = Number.isInteger(id) ? await getProfile(id) : null;
  if (!profile) notFound();
  // Phone and address never reach the page: the person asks for them ("Retrieve info") and the request is logged. See lib/pii.ts.
  return <Member profile={{ ...profile, phone: "", address1: "", address2: "", city: "", state: "", zip: "" }} canEdit={level === "write"} roster={await hasRoster(id)} />;
}
