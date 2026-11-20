"use client";
import Link from "next/link";
import { useAlerts } from "../alerts";

// What is waiting for you, as links straight to each queue (the server only counts the kinds you can open).
export default function Needs() {
  const a = useAlerts("/admin/landing");
  const items = a ? ([[a.applicants, "new member", "/admin/people/approvals", "waiting for approval"], [a.reviews, "review", "/admin/website/reviews", "waiting for approval"], [a.comments, "comment", "/admin/blog/comments", "waiting for moderation"], [a.walkups, "walk-up", "/admin/tours/walkups", "waiting for tour times"], [a.renewals, "ID renewal", "/admin/people/id-renewals", "waiting for review"], [a.forms, "held message", "/admin/messages", "caught by the spam filter"]] as const).filter(([n]) => n > 0) : [];
  return (
    <section aria-labelledby="needs-h">
      <h2 id="needs-h">Needs your attention</h2>
      {!a && <p className="sub" role="status">Checking…</p>}
      {a && !items.length && <p className="sub">Nothing is waiting. New reviews, comments, members and held messages will show up here.</p>}
      <div className="needs">{items.map(([n, noun, href, why]) => <Link key={href} href={href} className="card"><b>{n}</b>{noun}{n === 1 ? "" : "s"} {why}</Link>)}</div>
    </section>
  );
}
