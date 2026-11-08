import type { ReactNode } from "react";
import AdminBar from "./admin-bar";
import Frame from "./frame";
import Alerts from "./alerts";
import Nav from "./nav";
import UserMenu from "./user-menu";
import { SECTIONS, levelOf, me } from "@/lib/guard";
import "./webmaster/webmaster.css";

// Every admin page: top bar with the section tabs, the section's left menu with your account at the bottom, then the page.
export default async function AdminRoot({ children }: { children: ReactNode }) {
  const m = await me();
  return (
    <div className="adm adm-root">
      <Frame /><AdminBar allowed={SECTIONS.filter((s) => levelOf(m, s))} /><Alerts />
      <div className="adm-body">
        <aside className="adm-side"><Nav admin={levelOf(m, "admin") === "write"} user={m && <UserMenu name={m.name} email={m.email} image={m.image} />} /></aside>
        <main className="adm-main">{children}</main>
      </div>
    </div>
  );
}
