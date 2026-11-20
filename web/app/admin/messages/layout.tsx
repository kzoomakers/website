import type { ReactNode } from "react";
import ReadOnly from "../read-only";

export default function FormsLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="messages">{children}</ReadOnly>;
}
