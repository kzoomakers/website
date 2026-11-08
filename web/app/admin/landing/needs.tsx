"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type A = { reviews: number; comments: number; forms: number; applicants: number };

// What is waiting for you, as links straight to each queue (only the kinds you can open come back non-zero).
export default function Needs() {
  const [a, setA] = useState<A | null>(null), [bad, setBad] = useState(false);
  useEffect(() => { fetch("/api/webmaster/alerts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setA, () => setBad(true)); }, []);
  const items = a ? ([[a.applicants, "new member", "/admin/crm/approvals", "waiting for approval"], [a.reviews, "review", "/admin/webmaster/reviews", "waiting for approval"], [a.comments, "comment", "/admin/blog/comments", "waiting for moderation"], [a.forms, "held message", "/admin/forms", "caught by the spam filter"]] as const).filter(([n]) => n > 0) : [];
  return (
    <section aria-labelledby="needs-h">
      <h2 id="needs-h">Needs your attention</h2>
      {bad && <p className="err" role="alert">Couldn't check what's waiting. Reload to try again.</p>}
      {!a && !bad && <p className="sub" role="status">Checking…</p>}
      {a && !items.length && <p className="sub">Nothing is waiting. New reviews, comments, members and held messages will show up here.</p>}
      <div className="needs">{items.map(([n, noun, href, why]) => <Link key={href} href={href} className="card"><b>{n}</b>{noun}{n === 1 ? "" : "s"} {why}</Link>)}</div>
    </section>
  );
}
