import { redirect } from "next/navigation";
import { gate, levelOf, me } from "@/lib/guard";
import { counts, listApplicants } from "@/lib/approvals";
import { SIGNUPS_PER_HOUR, signupsThisHour } from "@/lib/readers";
import SignupLimit from "./signup-limit";
import Approvals from "../crm/approvals/approvals";
import { getConfig } from "@/lib/config";
import { listUsers } from "@/lib/users";
import Users from "./users";
import ApiKeys from "./api-keys";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const level = await gate("admin", "/admin/users");
  if (!getConfig()) redirect("/admin/services");
  const crm = levelOf(await me(), "crm"); // the queue is for anyone who can work CRM; full admins can always
  return <>
    <SignupLimit used={await signupsThisHour()} limit={SIGNUPS_PER_HOUR} canEdit={level === "write"} />
    {crm && <Approvals compact initial={{ rows: await listApplicants("pending"), counts: await counts() }} canEdit={crm === "write"} />}
    <Users initial={await listUsers("")} canEdit={level === "write"} />
    <ApiKeys canEdit={level === "write"} />
  </>;
}
