import type { ReactNode } from "react";
import ReadOnly from "../read-only";
import "./mailadmin.css";

export default function MailLayout({ children }: { children: ReactNode }) {
  return <ReadOnly section="mail"><div className="mp-wide">{children}</div></ReadOnly>;
}
