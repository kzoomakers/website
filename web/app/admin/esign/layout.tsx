import type { ReactNode } from "react";
import ReadOnly from "../read-only";

export default function SignedDocsLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="board">{children}</ReadOnly>;
}
