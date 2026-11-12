import type { ReactNode } from "react";
import ReadOnly from "../read-only";

export default function ChoresLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="chores">{children}</ReadOnly>;
}
