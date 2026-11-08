import type { ReactNode } from "react";
import ReadOnly from "../read-only";

export default function BlogAdminLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="blog">{children}</ReadOnly>;
}
