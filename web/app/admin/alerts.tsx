"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type A = { reviews: number; reviewMax: number; comments: number; commentMax: number; forms: number; formMax: number };
const KEY = "admin-alert-ack"; // newest pending ids this browser has acknowledged; anything newer pops up again

const read = (): { r: number; c: number; f: number } => { try { return { r: 0, c: 0, f: 0, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { r: 0, c: 0, f: 0 }; } };

// A pop-up on every admin page whenever new reviews or comments are waiting, until someone acknowledges it.
export default function Alerts() {
  const [a, setA] = useState<A | null>(null), path = usePathname(), ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let live = true;
    const poll = () => fetch("/api/webmaster/alerts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => live && d && setA(d), () => {});
    poll();
    const t = setInterval(poll, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [path]);
  const ack = read(), newR = !!a && a.reviews > 0 && a.reviewMax > ack.r, newC = !!a && a.comments > 0 && a.commentMax > ack.c, newF = !!a && a.forms > 0 && a.formMax > ack.f;
  const show = (newR || newC || newF) && !path.startsWith("/admin/webmaster/reviews") && !path.startsWith("/admin/blog/comments") && !path.startsWith("/admin/forms");
  useEffect(() => { if (show) ok.current?.focus(); }, [show]);
  if (!a || !show) return null;
  // Acknowledge everything shown, or only the kind being opened so the other keeps nagging.
  const done = (only?: "r" | "c" | "f") => { try { localStorage.setItem(KEY, JSON.stringify(only ? { ...ack, [only]: { r: a.reviewMax, c: a.commentMax, f: a.formMax }[only] } : { r: a.reviewMax, c: a.commentMax, f: a.formMax })); } catch {} setA({ ...a }); };
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="adm-alert-t" onKeyDown={(e) => e.key === "Escape" && done()}
      style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <style>{`@keyframes adm-flash{0%,100%{box-shadow:0 0 0 0 rgba(255,166,0,.8)}50%{box-shadow:0 0 0 14px rgba(255,166,0,0)}}@media (prefers-reduced-motion:no-preference){.adm-alert{animation:adm-flash 1.2s ease-in-out 4}}`}</style>
      <div className="adm-alert" style={{ background: "#fff", color: "#222", borderRadius: 12, padding: 24, maxWidth: 420, width: "100%", border: "3px solid #ffa600" }}>
        <h2 id="adm-alert-t" style={{ marginTop: 0 }}>🔔 Needs your attention</h2>
        <ul style={{ paddingLeft: 20 }}>
          {newR && <li><strong>{a.reviews}</strong> review{a.reviews === 1 ? "" : "s"} waiting for approval</li>}
          {newC && <li><strong>{a.comments}</strong> comment{a.comments === 1 ? "" : "s"} waiting for moderation</li>}
          {newF && <li><strong>{a.forms}</strong> contact message{a.forms === 1 ? "" : "s"} held by the spam filter</li>}
        </ul>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button ref={ok} onClick={() => done()}>Got it</button>
          <a href={newR ? "/admin/webmaster/reviews" : newC ? "/admin/blog/comments" : "/admin/forms"} onClick={() => done(newR ? "r" : newC ? "c" : "f")}><button className="pri">Review now</button></a>
        </div>
      </div>
    </div>
  );
}
