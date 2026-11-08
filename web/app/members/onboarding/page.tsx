import { redirect } from "next/navigation";
import { currentApplicant } from "@/lib/readers";
import { ID_KINDS } from "@/lib/onboarding";
import { changesFor, latestVersion } from "@/lib/waiver";
import Steps from "./steps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome | Kzoo Makers", robots: { index: false } };

// Required steps after approval (agreement, handbook, ID), or just the new agreement when it changed. The server refuses to skip ahead; this page only shows the current step.
export default async function Onboarding() {
  const u = await currentApplicant().catch(() => null);
  if (!u) redirect("/login?next=/members/onboarding");
  if (u.approval !== "approved") redirect("/members");
  if (u.onboarding === "done") redirect("/members");
  if (u.onboarding === "profile") redirect("/account?setup=1&next=%2Fmembers"); // phone, address and an emergency contact are required before anything else
  const step = u.onboarding as "waiver" | "handbook" | "id" | "resign", v = await latestVersion();
  const ch = step === "resign" ? await changesFor(u.id) : null;
  return <><h1>{step === "resign" ? "Our membership agreement has changed" : `Welcome, ${u.name.split(" ")[0]}`}</h1>
    <Steps step={step} name={u.name} version={v} kinds={ID_KINDS} update={ch && ch.last ? { last: ch.last.revision, changes: ch.changes, notes: ch.notes } : null} /></>;
}
