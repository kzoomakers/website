"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Envelope from "./envelope";

const MENU = [["/members", "🏠", "Home"], ["/members/directory", "🔎", "Directory"], ["/members/classes", "🎓", "Classes"], ["/members/profile", "👤", "My Profile"], ["/members/inbox", "✉️", "Inbox"], ["/account", "⚙️", "Account"]] as const;

// Same bar and sidebar as the admin area (styles come from admin's webmaster.css), with the members links.
export function Bar({ signedIn }: { signedIn: boolean }) {
  const here = usePathname();
  return (
    <header className="adm-top">
      <Link href="/members" className="adm-brand"><img src="/images/favicon.png" alt="" width={24} height={24} />Kzoo Makers</Link>
      <nav aria-label="Sections">
        <Link href="/members" aria-current={here.startsWith("/members") || here.startsWith("/account") ? "page" : undefined}>Members</Link>
      </nav>
      <span className="adm-sp" />
      {signedIn && <Envelope />}
    </header>
  );
}

export function Side({ user }: { user: ReactNode }) {
  const here = usePathname();
  return (
    <aside className="adm-side">
      {MENU.map(([href, icon, label]) => {
        const on = href === "/members" ? here === href : here === href || here.startsWith(href + "/");
        return <Link key={href} href={href} className="adm-link" aria-current={on ? "page" : undefined}><span aria-hidden>{icon}</span>{label}</Link>;
      })}
      <span className="adm-sp" />
      <a className="adm-link" href="/" target="_blank">↗ View site</a>
      {user}
    </aside>
  );
}
