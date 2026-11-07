import type { ReactNode } from "react";
import { WebmasterRibbon } from "@/components/admin-link";
import { auth } from "@/auth";
import Nav from "./nav";
import UserMenu from "./user-menu";
import "./webmaster.css";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const u = (await auth())?.user;
  return (
    <div className="adm">
      <WebmasterRibbon />
      <aside className="adm-side"><div className="adm-brand">Kzoo Makers</div><Nav />{u?.email && <UserMenu name={u.name ?? ""} email={u.email} image={u.image ?? undefined} />}</aside>
      <main className="adm-main">{children}</main>
    </div>
  );
}
