import type { ReactNode } from "react";

export default function FormsLayout({ children }: { children: ReactNode }) {
  return <div className="adm-body" style={{ gridTemplateColumns: "1fr" }}><main className="adm-main">{children}</main></div>;
}
