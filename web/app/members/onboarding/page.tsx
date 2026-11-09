import { redirect } from "next/navigation";
import { currentApplicant } from "@/lib/readers";
import { changesFor, latestVersion } from "@/lib/waiver";
import Resign from "./steps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome | Kzoo Makers", robots: { index: false } };

// Members who must sign a newer agreement. The server refuses to skip ahead; this page only shows the current step.
export default async function Onboarding() {
  const u = await currentApplicant().catch(() => null);
  if (!u) redirect("/login?next=/members/onboarding");
  if (u.approval !== "approved") redirect("/members");
  if (u.onboarding !== "resign") redirect("/members"); // first-time steps are the welcome wizard (members/wizard.tsx), shown over every members page
  const v = await latestVersion(), ch = await changesFor(u.id);
  return <><h1>Our membership agreement has changed</h1>
    <Resign name={u.name} version={v} update={ch && ch.last ? { last: ch.last.revision, changes: ch.changes, notes: ch.notes } : null} /></>;
}
