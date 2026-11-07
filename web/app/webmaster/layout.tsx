import type { ReactNode } from "react";
import Nav from "./nav";
import "./webmaster.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adm">
      <aside className="adm-side"><div className="adm-brand">Kzoo Makers</div><Nav /></aside>
      <main className="adm-main">{children}</main>
    </div>
  );
}
