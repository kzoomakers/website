import { notFound } from "next/navigation";
import { trainingEnabled } from "@/lib/training/settings";
import MembersShell from "../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training | Kzoo Makers", robots: { index: false } };

export default async function TrainingPage() {
  if (!(await trainingEnabled())) notFound();
  return (
    <MembersShell title="Training" path="/members/training">
      {async () => <p className="sub">Tool training and tests are coming soon.</p>}
    </MembersShell>
  );
}
