"use client";
import { useEffect, useState } from "react";
import { cleanICSText, eventsOn, parseICS, timeLabel } from "@/public/vendor/kzoo-calendar";
import { countdown, type Span } from "@/lib/today-countdown";

type Row = Span & { title: string; when: string; where: string; about: string };
type Theme = { a: string; bg: string; fg: string; stub: string; stubfg: string; edge: string };
type Kind = "date" | "paper" | "agenda";

// Dark themes (styles "date" and "agenda") and light/inverted themes (style "paper"); one is picked at random per visit.
const DARK: Theme[] = [
  { a: "#ff8a3d", bg: "#2a1620", fg: "#ffe9d6", stub: "#ffe9d6", stubfg: "#2a1620", edge: "#6b2f45" }, // sunset
  { a: "#2dd4b4", bg: "#0f2a2a", fg: "#e6fffa", stub: "#e6fffa", stubfg: "#0f2a2a", edge: "#1f5a55" }, // teal
  { a: "#ef4444", bg: "#111111", fg: "#f4f4f4", stub: "#f4f4f4", stubfg: "#111111", edge: "#444444" }, // mono + red
  { a: "#60a5fa", bg: "#0f1b2e", fg: "#e6f0ff", stub: "#e6f0ff", stubfg: "#0f1b2e", edge: "#27508a" }, // ocean
  { a: "#a3e635", bg: "#142014", fg: "#eefbe0", stub: "#eefbe0", stubfg: "#142014", edge: "#3a5a2a" }, // forest
  { a: "#c084fc", bg: "#1d1530", fg: "#f1e8ff", stub: "#f1e8ff", stubfg: "#1d1530", edge: "#5b3d99" }, // grape
];
const PAPER: Theme[] = [
  { a: "#c2410c", bg: "#f6f0e4", fg: "#1f2a44", stub: "#1f2a44", stubfg: "#f6f0e4", edge: "#1f2a44" }, // cream + navy
  { a: "#15803d", bg: "#eaf4ea", fg: "#14301c", stub: "#14301c", stubfg: "#eaf4ea", edge: "#14301c" }, // mint + forest
  { a: "#be185d", bg: "#fbeaf0", fg: "#3b1030", stub: "#3b1030", stubfg: "#fbeaf0", edge: "#3b1030" }, // blush + plum
  { a: "#0369a1", bg: "#e8f2fa", fg: "#222831", stub: "#222831", stubfg: "#e8f2fa", edge: "#222831" }, // sky + charcoal
  { a: "#b45309", bg: "#fdf3d8", fg: "#3a2a10", stub: "#3a2a10", stubfg: "#fdf3d8", edge: "#3a2a10" }, // butter + brown
];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Home-page "today's the day" card: slides in when the calendar feed has something on today, once per browser session per day. Hover (or tap) for details. */
export default function TodayFlash() {
  const [rows, setRows] = useState<Row[]>([]), [open, setOpen] = useState(false), [more, setMore] = useState(false), [tick, setTick] = useState(() => Date.now());
  const [look, setLook] = useState<{ kind: Kind; t: Theme }>({ kind: "agenda", t: DARK[0] });
  useEffect(() => {
    const day = new Date().toDateString();
    try { if (sessionStorage.getItem("today-flash") === day) return; } catch { /* storage blocked: show every visit */ }
    let live = true;
    fetch("/api/calendar").then((r) => (r.ok ? r.text() : "")).then((ics) => {
      const now = new Date();
      // Timed events that already finished today are no longer news.
      const list = eventsOn(parseICS(ics, now), now).filter((e) => e.isAllDay || e.end > now || +e.end === +e.start);
      if (!live || !list.length) return;
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setRows(list.map((e) => {
        const allDay = e.isAllDay || e.start < midnight;
        return {
          title: cleanICSText(e.title),
          when: allDay ? "All day" : +e.end === +e.start ? timeLabel(e.start) : `${timeLabel(e.start)} – ${timeLabel(e.end)}`,
          where: cleanICSText(e.location),
          about: cleanICSText(e.description),
          start: +e.start, end: +e.end, allDay,
        };
      }));
      // One event: randomly big-date or paper-stamp style. Several: the agenda stack.
      const kind: Kind = list.length > 1 ? "agenda" : pick<Kind>(["date", "paper"]);
      setLook({ kind, t: pick(kind === "paper" ? PAPER : DARK) });
      setOpen(true);
    }).catch(() => { /* no calendar, no card */ });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick(Date.now()), 30_000); // countdown only needs minute accuracy
    return () => clearInterval(id);
  }, [open]);
  useEffect(() => {
    if (!more) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [more]);
  const close = () => { setOpen(false); setMore(false); try { sessionStorage.setItem("today-flash", new Date().toDateString()); } catch { /* shows again next visit */ } };
  if (!open) return null;

  const { kind, t } = look, now = new Date();
  const cds = rows.map((r) => countdown(r, tick));
  // Agenda highlights the next event that hasn't ended; if all are over, the last one.
  const next = cds.findIndex((c) => c.state !== "over");
  const i0 = kind === "agenda" ? (next < 0 ? rows.length - 1 : next) : 0;
  const r0 = rows[i0], cd = cds[i0];
  const vars = { "--a": t.a, "--bg": t.bg, "--fg": t.fg, "--stub": t.stub, "--stubfg": t.stubfg, "--edge": t.edge } as React.CSSProperties;
  const dow = now.toLocaleDateString("en-US", { weekday: "long" }), mon = now.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const place = r0.where.split(",")[0];
  const toggle = () => setMore((v) => !v);
  return (
    <>
      {/* Not role="status": the countdown changes every 30s and screen readers would re-announce it each time. */}
      <aside className={`tdc tdc-${kind}`} style={vars} role="region" aria-label="Today's events" onPointerEnter={(e) => e.pointerType === "mouse" && setMore(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setMore(false)}>
        <div className="tdc-card" role="button" tabIndex={0} aria-expanded={more} aria-label="Show details for today's events" onClick={(e) => (e.nativeEvent as PointerEvent).pointerType !== "mouse" && toggle()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}>
          <div className="tdc-main"><div className="tdc-body">
            {kind === "date" && (
              <div className="tdc-datewrap">
                <div className="tdc-day"><small>{mon}</small><big>{now.getDate()}</big></div>
                <div className="tdc-txt">
                  <div className="tdc-kick">Happening today</div>
                  <h3>{r0.title}</h3>
                  {r0.about && <p>{r0.about}</p>}
                  <div className="tdc-mono">{r0.when}{place ? ` · ${place}` : ""}</div>
                </div>
              </div>
            )}
            {kind === "paper" && (
              <>
                <div className="tdc-top"><span className="tdc-mono tdc-dim">{dow.slice(0, 3).toUpperCase()} {now.getDate()} {mon}</span><span className="tdc-stamp">TODAY</span></div>
                <h3 className="tdc-serif">{r0.title}</h3>
                {r0.about && <p>{r0.about}</p>}
                <div className="tdc-row"><span>{r0.when}</span>{place && <span>{place}</span>}</div>
              </>
            )}
            {kind === "agenda" && (
              <>
                <div className="tdc-top"><span className="tdc-head">Today · {dow.slice(0, 3)} {now.getDate()}</span><span className="tdc-mono tdc-dim">{rows.length} EVENTS</span></div>
                <ul className="tdc-tl">{rows.slice(0, 3).map((r, i) => <li key={i}><i /><b>{r.when.split(" – ")[0]}</b><span>{r.title}</span></li>)}</ul>
                <div className="tdc-foot">{rows.length > 3 ? `+${rows.length - 3} more · ` : ""}hover or tap for details</div>
              </>
            )}
          </div></div>
          <div className="tdc-stub">
            <div><b>{kind === "agenda" ? "NEXT UP" : cd.label}</b><br /><small>{kind === "agenda" ? r0.title : r0.when}</small></div>
            <div className="tdc-mono tdc-big">{cd.big}</div>
            {kind === "agenda" && <small className="tdc-cdl">{cd.label}</small>}
          </div>
        </div>
        {more && (
          <div className="tdc-modal">
            <div className="tdc-kick">Today · {dow}, {now.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
            {rows.map((r, i) => (
              <section key={i}>
                <h4>{r.title}</h4>
                <div className="tdc-mono">{r.when} · {cds[i].state === "over" ? "Ended" : `${cds[i].label.toLowerCase()} ${cds[i].big}`}</div>
                {r.where && <div className="tdc-where">{r.where}</div>}
                {r.about ? <p>{r.about}</p> : <p className="tdc-dim">No extra details yet. See the calendar for more.</p>}
              </section>
            ))}
            <a href="/calendar.html">Open the full calendar →</a>
          </div>
        )}
        <button type="button" className="tdc-x" aria-label="Dismiss" onClick={close}>×</button>
      </aside>

      <style>{`
        .tdc{position:fixed;z-index:9000;top:12px;right:12px;width:min(420px,calc(100vw - 24px));animation:tdc-in .4s ease-out}
        .tdc-card{display:flex;height:150px;cursor:pointer;filter:drop-shadow(0 3px 6px rgba(0,0,0,.28));font-family:system-ui,sans-serif;text-align:left}
        .tdc-card:focus-visible{outline:2px solid var(--a);outline-offset:2px}
        .tdc-main{flex:1;min-width:0;padding:3px;background:var(--edge);mask:radial-gradient(11px at 100% 50%,#0000 98%,#000);-webkit-mask:radial-gradient(11px at 100% 50%,#0000 98%,#000)}
        .tdc-body{height:100%;border-radius:3px;background:var(--bg);color:var(--fg);padding:9px 12px;display:flex;flex-direction:column;overflow:hidden;font-size:11px}
        .tdc-stub{width:104px;flex:none;padding:9px 10px;background:var(--stub);color:var(--stubfg);border-left:2px dotted rgba(18,18,18,.45);display:flex;flex-direction:column;justify-content:space-between;font-size:9px;mask:radial-gradient(11px at 0 50%,#0000 98%,#000);-webkit-mask:radial-gradient(11px at 0 50%,#0000 98%,#000)}
        .tdc-paper .tdc-stub{border-left-color:rgba(246,240,228,.45)}
        .tdc-stub b{letter-spacing:.06em}
        .tdc-big{font-size:17px;font-weight:700;line-height:1.1}.tdc-cdl{font-size:8px;letter-spacing:.12em;opacity:.7}
        .tdc-mono{font-family:"Courier New",monospace}.tdc-dim{opacity:.7;font-size:9px}
        .tdc-body h3{margin:2px 0;font-size:16px;line-height:1.15;color:inherit;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
        .tdc-body p{margin:1px 0;font-size:11px;opacity:.85;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
        .tdc-stub small:not(.tdc-cdl){display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
        .tdc-kick{color:var(--a);font-weight:700;font-size:10px;letter-spacing:.16em;text-transform:uppercase}
        .tdc-datewrap{display:flex;gap:12px;align-items:center;height:100%}
        .tdc-day{text-align:center;border-right:1px solid var(--edge);padding-right:12px;display:flex;flex-direction:column}
        .tdc-day small{font:9px "Courier New",monospace;opacity:.7}.tdc-day big{font-size:44px;line-height:1;font-weight:800;color:var(--a)}
        .tdc-txt{flex:1;min-width:0}.tdc-txt .tdc-mono{font-size:11px;margin-top:4px}
        .tdc-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
        .tdc-head{color:var(--a);font-weight:700;font-size:15px}
        .tdc-tl{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
        .tdc-tl li{display:flex;gap:8px;align-items:center;font-size:12px;min-width:0}.tdc-tl li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tdc-tl b{font:700 11px "Courier New",monospace;width:62px;flex:none}.tdc-tl i{width:6px;height:6px;border-radius:50%;background:var(--a);flex:none}
        .tdc-foot{margin-top:auto;border-top:1px solid var(--edge);padding-top:4px;font-size:9px;opacity:.7}
        .tdc-body .tdc-serif{font-family:Georgia,serif;font-size:19px;margin-top:6px}
        .tdc-stamp{border:1.5px solid var(--a);color:var(--a);padding:1px 6px;font:700 10px "Courier New",monospace;letter-spacing:2px;transform:rotate(-4deg)}
        .tdc-row{display:flex;gap:10px;margin-top:auto;border-top:1px solid var(--edge);padding-top:4px;font:11px "Courier New",monospace}
        .tdc-x{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;border:0;background:#fff;color:#222;font-size:15px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35)}
        .tdc-modal{position:absolute;top:100%;left:0;right:0;z-index:2;max-height:55vh;overflow:auto;background:var(--bg);color:var(--fg);border-top:4px solid var(--a);border-radius:0 0 8px 8px;padding:12px 16px;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 8px 20px rgba(0,0,0,.35)}
        .tdc-modal section{margin:10px 0;padding-top:8px;border-top:1px solid var(--edge)}.tdc-modal h4{margin:0 0 2px;font-size:15px}
        .tdc-modal h4,.tdc-modal p,.tdc-where{overflow-wrap:anywhere}
        .tdc-modal p{white-space:pre-line;margin:6px 0 0;line-height:1.4}.tdc-where{font-size:12px;opacity:.85}
        .tdc-modal a{color:var(--a);font-weight:700}
        @keyframes tdc-in{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}
        @media (max-width:420px){.tdc-stub{width:84px}.tdc-big{font-size:15px}}
        @media (prefers-reduced-motion:reduce){.tdc{animation:none}}
      `}</style>
    </>
  );
}
