import type { ReactNode } from "react";
import "./mailadmin.css";

export default function MailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adm-body" style={{ gridTemplateColumns: "1fr" }}>
      <main className="adm-main" style={{ maxWidth: 1400 }}>{children}</main>
    </div>
  );
}
