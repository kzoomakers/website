import type { Acct } from "@/lib/tours";
import { stage } from "./member-flow";
import "./walkups/walkups.css";

type P = { email: string; phone: string; zip: string; contact_method: string; interest: string; heard: string; notes: string; client_ip: string; user_agent: string; screen: string; acct: Acct; activated_at: string | null; activated_by: string };
const ago = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** What we know about the person, laid out the same for a walk-up request and a booked tour. */
export default function PersonInfo({ p }: { p: P }) {
  const s = stage(p.acct);
  return (
    <>
      <div className="wk-contact">
        <a className="wk-chip" href={`mailto:${p.email}`}>{p.email}</a>
        <a className="wk-chip" href={`tel:${p.phone}`}>{p.phone}</a>
        {p.zip && <span className="wk-chip">Zip {p.zip}</span>}
        {p.contact_method && <span className="wk-chip">Prefers {p.contact_method}</span>}
      </div>
      {s && <div className="wk-line"><b>Membership</b> {s}{p.activated_at && ` · activated by ${p.activated_by} on ${ago(p.activated_at)}`}</div>}
      {p.interest && <div className="wk-line"><b>Interested in</b> {p.interest}</div>}
      {p.heard && <div className="wk-line"><b>Heard about us</b> {p.heard}</div>}
      {p.notes && <div className="wk-line"><b>Notes</b> {p.notes}</div>}
      {(p.client_ip || p.user_agent || p.screen) && <div className="wk-line wk-meta">Device: {[p.client_ip, p.screen, p.user_agent].filter(Boolean).join(" · ")}</div>}
    </>
  );
}
