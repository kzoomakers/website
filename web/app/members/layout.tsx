import type { ReactNode } from "react";
import { currentApplicant } from "@/lib/readers";
import Frame from "../admin/frame";
import UserMenu from "../admin/user-menu";
import { Bar, Side } from "./chrome";
import "../admin/webmaster/webmaster.css";

// Members area wears the admin chrome: framed page, top bar, left menu with your account at the bottom.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const u = await currentApplicant().catch(() => null), ok = u?.approval === "approved";
  return (
    <div className="adm adm-root">
      <Frame /><Bar signedIn={ok} />
      <div className="adm-body">
        <Side limited={!!u && !ok} user={u && <UserMenu name={u.name} email={u.email} limited={!ok} />} />
        <main className="adm-main">{children}</main>
      </div>
    </div>
  );
}
