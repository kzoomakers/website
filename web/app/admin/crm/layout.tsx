import type { ReactNode } from "react";
import ReadOnly from "../read-only";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="crm">{children}</ReadOnly>;
}
