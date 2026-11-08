import type { ReactNode } from "react";
import { currentReader } from "@/lib/readers";
import Frame from "../admin/frame";
import UserMenu from "../admin/user-menu";
import { Bar, Side } from "./chrome";
import "../admin/webmaster/webmaster.css";

// Members area wears the admin chrome: framed page, top bar, left menu with your account at the bottom.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const u = await currentReader().catch(() => null);
  return (
    <div className="adm adm-root">
      <Frame /><Bar signedIn={!!u} />
      <div className="adm-body">
        <Side user={u && <UserMenu name={u.name} email={u.email} />} />
        <main className="adm-main">{children}</main>
      </div>
    </div>
  );
}
