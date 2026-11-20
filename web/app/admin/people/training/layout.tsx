import type { ReactNode } from "react";
import ReadOnly from "../../read-only";

// Training pages are their own permission section, so their view-only state comes from it (not from People's).
export default function TrainingLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="training">{children}</ReadOnly>;
}
