import { gate } from "@/lib/guard";

export const dynamic = "force-dynamic";

// Placeholder until the reports phase.
export default async function ReportsPage() {
  await gate("training", "/admin/people/training/reports");
  return <><h1>Training reports</h1><p className="sub">Coming soon.</p></>;
}
