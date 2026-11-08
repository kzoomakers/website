import { redirect } from "next/navigation";
import { gate, levelOf, me } from "@/lib/guard";
import { counts, listApplicants } from "@/lib/approvals";
import { SIGNUPS_PER_HOUR, signupsThisHour } from "@/lib/readers";
import SignupLimit from "./signup-limit";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { listUsers } from "@/lib/users";
import Users from "./users";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const level = await gate("admin", "/admin/users");
  if (!getConfig()) redirect("/admin/services");
  const crm = levelOf(await me(), "crm"); // the queue is for anyone who can work CRM; full admins can always
  const waiting = crm ? (await counts()).pending : 0;
  return <>
    <Users initial={await listUsers("")} canEdit={level === "write"} />
    {waiting > 0 && <p className="sub" role="status">{waiting} new {waiting === 1 ? "member is" : "members are"} waiting for approval. <Link href="/admin/crm/approvals">Review them</Link></p>}
    <SignupLimit used={await signupsThisHour()} limit={SIGNUPS_PER_HOUR} canEdit={level === "write"} />
  </>;
}
