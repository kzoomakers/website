import { notFound } from "next/navigation";
import { classesOn } from "@/lib/features";
import { classMinDays, myProposals, upcomingClasses } from "@/lib/crm";
import MembersShell from "../shell";
import Classes from "./classes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classes | Kzoo Makers", robots: { index: false } };

export default async function ClassesPage() {
  if (!(await classesOn())) notFound();
  return (
    <MembersShell title="Classes" path="/members/classes">
      {async (u) => {
        const [classes, proposals, minDays] = await Promise.all([upcomingClasses(u.id), myProposals(u.id), classMinDays()]);
        return <Classes initial={classes} proposals={proposals} minDays={minDays} />;
      }}
    </MembersShell>
  );
}
