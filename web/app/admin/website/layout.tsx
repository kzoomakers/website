import type { ReactNode } from "react";
import ReadOnly from "../read-only";

export default function WebmasterLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="website">{children}</ReadOnly>;
}
