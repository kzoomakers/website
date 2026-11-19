"use client";
import { useEffect, useState } from "react";
import { cleanICSText, eventsOn, parseICS, timeLabel } from "@/public/vendor/kzoo-calendar";

/** Home-page "today's the day" card: slides in when the calendar feed has something on today, once per browser session per day. */
export default function TodayFlash() {
  const [rows, setRows] = useState<{ title: string; when: string; where: string }[]>([]), [open, setOpen] = useState(false);
  useEffect(() => {
    const day = new Date().toDateString();
    try { if (sessionStorage.getItem("today-flash") === day) return; } catch { /* storage blocked: show every visit */ }
    let live = true;
    fetch("/api/calendar").then((r) => (r.ok ? r.text() : "")).then((ics) => {
      const now = new Date();
      // Timed events that already finished today are no longer news.
      const list = eventsOn(parseICS(ics, now), now).filter((e) => e.isAllDay || e.end > now || +e.end === +e.start);
      if (!live || !list.length) return;
      setRows(list.map((e) => ({ title: cleanICSText(e.title), when: e.isAllDay || e.start < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? "All day" : timeLabel(e.start), where: cleanICSText(e.location).split(",")[0] })));
      setOpen(true);
    }).catch(() => { /* no calendar, no card */ });
    return () => { live = false; };
  }, []);
  const close = () => { setOpen(false); try { sessionStorage.setItem("today-flash", new Date().toDateString()); } catch { /* shows again next visit */ } };
  if (!open) return null;
  return (
    <>
      <aside className="today-flash" role="status" aria-live="polite">
        <button type="button" className="tf-x" aria-label="Dismiss" onClick={close}>×</button>
        <div className="tf-kick">Today&apos;s the day</div>
        <ul>{rows.slice(0, 3).map((r, i) => <li key={i}><b>{r.title}</b><span>{r.when}{r.where ? ` · ${r.where}` : ""}</span></li>)}</ul>
        {rows.length > 3 && <a href="/calendar.html">+{rows.length - 3} more on the calendar</a>}
        {rows.length <= 3 && <a href="/calendar.html">See the calendar →</a>}
      </aside>
      <style>{`
        .today-flash{position:fixed;z-index:9000;top:16px;right:16px;width:min(340px,calc(100vw - 32px));background:#fff;color:#1d1d1f;border-radius:12px;border-left:6px solid #f5a623;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:14px 16px;font-size:15px;line-height:1.35;animation:tf-in .5s cubic-bezier(.2,.9,.3,1.2)}
        .today-flash ul{list-style:none;margin:6px 0 8px;padding:0}.today-flash li{display:flex;flex-direction:column;margin:6px 0}.today-flash li span{color:#555;font-size:13px}
        .today-flash a{font-weight:600;font-size:13px;color:#b36b00}
        .tf-kick{font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#b36b00}
        .tf-x{position:absolute;top:4px;right:8px;background:none;border:0;font-size:22px;line-height:1;cursor:pointer;color:#666}
        @keyframes tf-in{from{opacity:0;transform:translateY(-24px) scale(.96)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.today-flash{animation:none}}
      `}</style>
    </>
  );
}
