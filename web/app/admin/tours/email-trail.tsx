"use client";
import { useState } from "react";
import type { MailTrail } from "@/lib/tours";
import { MAIL_KIND, autoOpen, linkLabel } from "@/lib/tours-fmt";
import { tours } from "./rpc";

const when = (d: string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const after = (ms: number) => { const m = Math.round(ms / 6e4); return m < 1 ? "under a minute" : m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`; };

/** One email's life as a rail: grey dot = sent, blue = opened (hollow = probably the mail app, not a person), orange diamond = clicked. Spacing is square-rooted so a click a week later doesn't squash the opens in the first hour. */
function Rail({ m }: { m: MailTrail[number] }) {
  const t0 = +new Date(m.sent_at), span = Math.max(36e5, ...m.events.map((e) => +new Date(e.at) - t0));
  const x = (at: string) => `${Math.sqrt(Math.max(0, +new Date(at) - t0) / span) * 100}%`;
  return (
    <div className="mt-rail" role="img" aria-label={`${m.events.length} events after sending`}>
      <i className="mt-dot sent" style={{ left: 0 }} title={`Sent ${when(m.sent_at)}`} />
      {m.events.map((e, i) => <i key={i} className={`mt-dot ${e.kind}${e.kind === "open" && autoOpen(m.sent_at, e.at) ? " auto" : ""}`} style={{ left: x(e.at) }} title={`${e.kind === "open" ? "Opened" : `Clicked “${linkLabel(e.detail)}”`} ${when(e.at)} (${after(+new Date(e.at) - t0)} after sending)`} />)}
    </div>
  );
}

/** What we emailed this person and what they did with it. Loads when opened, so a long list of people stays fast. */
export default function EmailTrail({ email }: { email: string }) {
  const [rows, setRows] = useState<MailTrail | null>(null), [err, setErr] = useState("");
  const load = async (open: boolean) => { if (open && !rows) try { setRows(await tours("mailTrail", { email })); } catch (e: any) { setErr(e.message); } };
  return (
    <details className="mt" onToggle={(e) => load((e.target as HTMLDetailsElement).open)}>
      <summary>Email activity</summary>
      {err && <p className="wk-line">{err}</p>}
      {rows && !rows.length && <p className="wk-line">Nothing tracked yet. Emails sent from now on show up here.</p>}
      {rows?.map((m) => {
        const opens = m.events.filter((e) => e.kind === "open"), clicks = m.events.filter((e) => e.kind === "click"), real = opens.filter((e) => !autoOpen(m.sent_at, e.at)), t0 = +new Date(m.sent_at);
        const seen = real[0] ?? opens[0];
        return (
          <div key={m.id} className="mt-mail">
            <div><b>{MAIL_KIND[m.kind] ?? m.kind}</b> <span className="wk-when">{when(m.sent_at)}</span></div>
            <Rail m={m} />
            <div className="mt-chips">
              <span className={"mt-chip" + (opens.length ? " open" : "")}>{opens.length ? `Opened ${opens.length}×, first ${after(+new Date(seen.at) - t0)} after sending${real.length ? "" : " (probably automatic)"}` : "Not opened"}</span>
              {[...new Set(clicks.map((c) => linkLabel(c.detail)))].map((l) => <span key={l} className="mt-chip click">Clicked “{l}”{clicks.filter((c) => linkLabel(c.detail) === l).length > 1 ? ` ×${clicks.filter((c) => linkLabel(c.detail) === l).length}` : ""}</span>)}
            </div>
          </div>
        );
      })}
    </details>
  );
}
