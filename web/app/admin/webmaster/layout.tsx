import type { ReactNode } from "react";
import { auth } from "@/auth";
import Nav from "./nav";
import UserMenu from "./user-menu";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const u = (await auth())?.user;
  return (
    <div className="adm-body">
      <aside className="adm-side"><Nav />{u?.email && <UserMenu name={u.name ?? ""} email={u.email} image={u.image ?? undefined} />}</aside>
      <main className="adm-main">{children}</main>
    </div>
  );
}
