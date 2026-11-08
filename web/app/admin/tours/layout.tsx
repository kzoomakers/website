import type { ReactNode } from "react";
import ReadOnly from "../read-only";

export default function ToursLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="tours">{children}</ReadOnly>;
}
