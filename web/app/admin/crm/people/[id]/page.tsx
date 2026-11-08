import { notFound, redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getProfile, listContacts } from "@/lib/profiles";
import Member from "./member";

export const dynamic = "force-dynamic";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const level = await gate("crm", "/admin/crm/people/" + id);
  if (!getConfig()) redirect("/admin/services");
  const profile = Number.isInteger(id) ? await getProfile(id) : null;
  if (!profile) notFound();
  return <Member profile={profile} contacts={await listContacts(id)} canEdit={level === "write"} />;
}
