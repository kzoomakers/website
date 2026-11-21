import type { ReactNode } from "react";
import { currentApplicant } from "@/lib/readers";
import { SECTIONS, hasAny, me } from "@/lib/guard";
import { features } from "@/lib/features";
import { libraryOn } from "@/lib/learn-flags";
import Frame from "../admin/frame";
import UserMenu from "../admin/user-menu";
import { Bar, Side } from "./chrome";
import Wizard from "./wizard";
import "../admin/website/webmaster.css";

// Members area wears the admin chrome: framed page, top bar, left menu with your account at the bottom.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const u = await currentApplicant().catch(() => null), ok = u?.approval === "approved" && u.onboarding === "done";
  const off = [...((await features()).classes ? [] : ["/members/classes"]), ...((await libraryOn()) ? [] : ["/members/library"])];
  const m = u && (await me().catch(() => null)), admin = !!m && SECTIONS.some((s) => hasAny(m, s));
  return (
    <div className="adm adm-root">
      <Frame /><Bar signedIn={ok} />
      <div className="adm-body">
        <Side hide={off} limited={!!u && !ok} user={u && <UserMenu name={u.name} email={u.email} swap={admin ? { href: "/admin", label: "Admin" } : undefined} />} />
        <main className="adm-main">{children}</main>
        {u && u.approval !== "rejected" && u.onboarding !== "resign" && (!ok || u.fresh) && <Wizard />}
      </div>
    </div>
  );
}
