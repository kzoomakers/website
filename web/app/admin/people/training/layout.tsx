import Link from "next/link";
import type { ReactNode } from "react";
import { features } from "@/lib/features";
import ReadOnly from "../../read-only";

// Training pages are their own permission section, so their view-only state comes from it (not from People's).
export default async function TrainingLayout({ children }: { children: ReactNode }) {
  const off = !(await features()).tests;
  return (
    <ReadOnly section="training">
      {off && <p className="card" role="status" style={{ padding: 12 }}>Online tests are switched off, so members can't start tests and re-pass reminders and lapse checks are paused. People already in the queue stay here. <Link href="/admin/people/workflows">Change in Workflows</Link></p>}
      {children}
    </ReadOnly>
  );
}
