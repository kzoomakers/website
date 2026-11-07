import type { ReactNode } from "react";
import { WebmasterRibbon } from "@/components/admin-link";
import "../webmaster/webmaster.css";
import "./mailadmin.css";

export default function MailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adm" style={{ gridTemplateColumns: "1fr" }}>
      <WebmasterRibbon />
      <main className="adm-main" style={{ maxWidth: 1400 }}>{children}</main>
    </div>
  );
}
