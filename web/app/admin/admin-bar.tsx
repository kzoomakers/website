"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS, tabOf } from "./tabs";
import { useAlerts } from "./alerts";
import { NAV, flat } from "@/lib/nav-manifest";


// Top bar shared by every admin section: logo/name left, section tabs, and a corner ribbon naming the current section.
export default function AdminBar({ allowed }: { allowed: Record<string, string> }) {
  const here = usePathname();
  const tabs = TABS.filter(([, , s]) => s in allowed);
  const cur = tabs.find(([h]) => h === tabOf(here));
  // Waiting items per tab: the sum of its links' counts (reviews, comments, held messages, applicants, walk-ups).
  const d = useAlerts(here), n: Record<string, number> = Object.fromEntries(NAV.map((t) => [t.href, flat(t.items).reduce((s, e) => s + ((e.alert && d?.[e.alert]) || 0), 0)]));
  return (
    <>
      <header className="adm-top">
        <Link href="/admin" className="adm-brand" aria-label="Kzoo Makers admin home"><img src="/images/favicon.png" alt="" width={24} height={24} />Kzoo Makers</Link>
        <nav aria-label="Admin sections">
          {tabs.map(([href, label, s]) => <Link key={href} href={allowed[s] || href} aria-current={cur?.[0] === href ? "page" : undefined}>{label}{n[href] > 0 && <span className="adm-n" title={`${n[href]} waiting`}>{n[href]}<span className="sr-only"> waiting</span></span>}</Link>)}
        </nav>
      </header>
    </>
  );
}
