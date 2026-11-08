"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "./tabs";


// Top bar shared by every admin section: logo/name left, section tabs, and a corner ribbon naming the current section.
export default function AdminBar({ allowed }: { allowed: string[] }) {
  const here = usePathname();
  const tabs = TABS.filter(([, , , s]) => allowed.includes(s));
  const cur = tabs.find(([h]) => here.startsWith(h) || (h === "/admin/users" && here.startsWith("/admin/services")));
  return (
    <>
      <header className="adm-top">
        <Link href="/admin" className="adm-brand" aria-label="Kzoo Makers admin home"><img src="/images/favicon.png" alt="" width={24} height={24} />Kzoo Makers</Link>
        <nav aria-label="Admin sections">
          {tabs.map(([href, label]) => <Link key={href} href={href} aria-current={cur?.[0] === href ? "page" : undefined}>{label}</Link>)}
        </nav>
      </header>
      {cur && (
        <div className="adm-ribbon" style={{ position: "fixed", top: 0, right: 0, width: 150, height: 150, overflow: "hidden", pointerEvents: "none", zIndex: 99999 }}>
          <Link href={cur[0]} style={{ position: "absolute", top: 34, right: -44, width: 200, padding: "6px 0", textAlign: "center", transform: "rotate(45deg)", background: cur[2], color: "#fff", font: "700 13px/1.2 sans-serif", letterSpacing: 1.5, textDecoration: "none", boxShadow: "0 2px 6px rgba(0,0,0,.4)", pointerEvents: "auto", textTransform: "uppercase" }}>{cur[1]}</Link>
        </div>
      )}
    </>
  );
}
