"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Envelope from "./envelope";
import Collapse from "../admin/collapse";
import { MEMBER_MENU } from "@/lib/nav-manifest";

const MENU = MEMBER_MENU;

// Same bar and sidebar as the admin area (styles come from admin's webmaster.css), with the members links.
export function Bar({ signedIn }: { signedIn: boolean }) {
  const here = usePathname();
  return (
    <header className="adm-top">
      <Link href="/members" className="adm-brand" aria-label="Kzoo Makers members home"><img src="/images/favicon.png" alt="" width={24} height={24} />Kzoo Makers</Link>
      <nav aria-label="Sections">
        <Link href="/members" aria-current={here.startsWith("/members") || here.startsWith("/account") ? "page" : undefined}>Members</Link>
      </nav>
      <span className="adm-sp" />
      {signedIn && <Envelope />}
    </header>
  );
}

// `limited`: not approved yet, so only Home and Account.
export function Side({ user, limited, training }: { user: ReactNode; limited?: boolean; training?: boolean }) {
  const here = usePathname();
  return (
    <aside className="adm-side"><Collapse>
      {MENU.filter(([href]) => (training || href !== "/members/training") && (!limited || href === "/members" || href === "/account")).map(([href, icon, label]) => {
        const on = href === "/members" ? here === href : here === href || here.startsWith(href + "/");
        return <Link key={href} href={href} className="adm-link" aria-current={on ? "page" : undefined}><span aria-hidden>{icon}</span>{label}</Link>;
      })}
      {limited && <p className="sub" style={{ padding: "8px 12px", fontSize: 13 }}>Only Home and My account are open until your membership is approved.</p>}
      {limited && <p className="sub" style={{ padding: "8px 12px", fontSize: 13 }}>Only Home and My account are open until your membership is approved.</p>}
      <span className="adm-sp" />
      <a className="adm-link" href="/" target="_blank">↗ View site</a>
      {user}
    </Collapse></aside>
  );
}
