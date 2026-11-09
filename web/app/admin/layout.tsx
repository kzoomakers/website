import type { ReactNode } from "react";
import AdminBar from "./admin-bar";
import Frame from "./frame";
import DocTitle from "./doc-title";
import Nav from "./nav";
import UserMenu from "./user-menu";
import { SECTIONS, levelOf, me } from "@/lib/guard";
import { s3Settings } from "@/lib/s3";
import "./webmaster/webmaster.css";

// Every admin page: top bar with the section tabs, the section's left menu with your account at the bottom, then the page.
export default async function AdminRoot({ children }: { children: ReactNode }) {
  const m = await me();
  const noStorage = levelOf(m, "admin") === "write" && !(await s3Settings().catch(() => 1)); // db errors are not "unset"
  return (
    <div className="adm adm-root">
      <Frame /><AdminBar allowed={SECTIONS.filter((s) => levelOf(m, s))} /><DocTitle />
      <div className="adm-body">
        <aside className="adm-side"><Nav admin={levelOf(m, "admin") === "write"} user={m && <UserMenu name={m.name} email={m.email} image={m.image} />} /></aside>
        <main className="adm-main">{noStorage && <p className="err">Image storage isn't set up, so uploads will fail. <a href="/admin/services">Set it up</a>.</p>}{children}</main>
      </div>
    </div>
  );
}
