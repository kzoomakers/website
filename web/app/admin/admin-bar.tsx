"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupOf, visibleGroups } from "./tabs";
import { useAlerts } from "./alerts";
import { NAV, flat } from "@/lib/nav-manifest";

// Top bar shared by every admin page: logo/name left, then the six groups. A group shows when you can open any section in it (Home always).
// The badge on a group adds up what is waiting in its sections (reviews, comments, held messages, applicants, walk-ups, ID renewals).
export default function AdminBar({ allowed }: { allowed: Record<string, string> }) {
  const here = usePathname(), cur = groupOf(here);
  const d = useAlerts(here);
  const waiting = (sections: string[]) => NAV.filter((t) => sections.includes(t.section)).reduce((s, t) => s + flat(t.items).reduce((k, e) => k + ((e.alert && d?.[e.alert]) || 0), 0), 0);
  return (
    <header className="adm-top">
      <Link href="/admin" className="adm-brand" aria-label="Kzoo Makers admin home"><img src="/images/favicon.png" alt="" width={24} height={24} />Kzoo Makers</Link>
      <nav aria-label="Admin sections">
        {visibleGroups(allowed).map(({ group: g, href }) => {
          const n = waiting(g.sections);
          return <Link key={g.label} href={href} aria-current={cur === g ? "page" : undefined}>{g.label}{n > 0 && <span className="adm-n" title={`${n} waiting`}>{n}<span className="sr-only"> waiting</span></span>}</Link>;
        })}
      </nav>
    </header>
  );
}
