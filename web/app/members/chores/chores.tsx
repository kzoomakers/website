"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { awardText, dueText, every, hrs, measureText, when } from "../../admin/chores/format";

type Chore = { id: number; name: string; every_days: number | null; notes: string; due_at: number | null; overdue_days: number | null; last_done_at: number | null; last_by: string | null; being_done_by: string[] };
type Shift = { id: number; chore: string; started_at: number };
type Hour = { name: string; user_id: number | null; hours: number; times: number };
type Data = { me: number; name: string; chores: Chore[]; mine: Shift[]; hours: Hour[] };
const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/members/chores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const PERIODS = [["this_week", "This week"], ["this_month", "This month"], ["this_year", "This year"], ["all_time", "All time"]];
const TABS = [["todo", "🧹 To do"], ["hours", "⏱️ Hours"], ["fame", "🏆 Achievements"], ["stats", "✨ Standouts"]];
const FILTERS = [["all", "All"], ["late", "Overdue"], ["soon", "Due soon"], ["free", "Nobody's on it"]];
const CHEERS = ["Nice work! 🎉", "You're a legend! 🌟", "The space thanks you! 💛", "Look at you go! 🚀", "Spotless! ✨", "High five! 🙌", "Makers gonna make! 🛠️"];
const MEDALS = ["🥇", "🥈", "🥉"];
const ICONS: [RegExp, string][] = [[/trash|garbage|bin|recycl/i, "🗑️"], [/vacuum|sweep|floor|mop/i, "🧹"], [/bath|restroom|toilet/i, "🚽"], [/dish|kitchen|fridge|coffee/i, "🍽️"], [/dust|wipe|clean|wash|window/i, "🧽"], [/laser|3d|print|cnc|tool|shop|wood|metal|weld/i, "🔧"], [/plant|garden|lawn|snow|yard|outside/i, "🌿"], [/stock|supply|inventor|order|sort|organi[sz]e/i, "📦"], [/light|bulb|electric/i, "💡"], [/mail|email|social/i, "📬"]];
const iconFor = (n: string) => ICONS.find(([r]) => r.test(n))?.[1] ?? "🛠️";
const mins = (s: number, now: number) => Math.max(0, Math.floor((now - s) / 60));
const clock = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60, p = (n: number) => String(n).padStart(2, "0"); return `${h ? h + ":" : ""}${p(m)}:${p(s)}`; };
// Urgency drives the card's color: late, today/soon (within 2 days), fine, or unscheduled.
const urgency = (c: Chore) => c.overdue_days === null ? "free" : c.overdue_days > 0 ? "late" : c.overdue_days >= -2 ? "soon" : "ok";
const MOOD = { late: "🔥", soon: "⏰", ok: "😌", free: "🎈" } as const;

const CSS = `
.ch{--r:14px}
.ch .hero{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:18px;border-radius:var(--r);background:linear-gradient(135deg,var(--acc-bg),var(--card));border:1px solid var(--line);margin:12px 0;animation:chUp .4s both}
.ch .hero .big{font-size:2rem;font-weight:700;line-height:1}
.ch .ring{--p:0;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--acc) calc(var(--p)*1%),var(--line) 0);transition:--p .6s}
.ch .ring>span{width:58px;height:58px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:1.5rem}
.ch .pill{display:inline-flex;gap:4px;align-items:center;padding:2px 10px;border-radius:99px;background:var(--acc-bg);font-size:.85em}
.ch .chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.ch .chips button{border-radius:99px;transition:transform .15s}
.ch .chips button:hover{transform:translateY(-2px)}
.ch .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
.ch .c{position:relative;background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:var(--r);padding:14px;display:flex;flex-direction:column;gap:6px;transition:transform .18s,box-shadow .18s;animation:chUp .4s both}
.ch .c:hover{transform:translateY(-3px);box-shadow:0 8px 20px rgba(0,0,0,.12)}
.ch .c.late{border-left-color:var(--bad)}.ch .c.soon{border-left-color:#e6a100}.ch .c.ok{border-left-color:var(--ok)}.ch .c.free{border-left-color:var(--acc)}
.ch .c .ico{font-size:1.9rem;display:inline-block;transition:transform .3s}.ch .c:hover .ico{transform:rotate(-12deg) scale(1.2)}
.ch .c.late .mood{animation:chWig 1.4s infinite}
.ch .c h3{margin:0;font-size:1.05rem}
.ch .meter{height:6px;border-radius:99px;background:var(--line);overflow:hidden}
.ch .meter i{display:block;height:100%;border-radius:99px;background:var(--ok);transition:width .6s}
.ch .c.late .meter i{background:var(--bad)}.ch .c.soon .meter i{background:#e6a100}
.ch .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:6px}
.ch .acts button{transition:transform .12s}.ch .acts button:active{transform:scale(.94)}
.ch .quick{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px;border-radius:10px;background:var(--acc-bg);animation:chUp .25s both}
.ch .quick button[aria-pressed=true]{outline:2px solid var(--acc)}
.ch .on{border:2px solid var(--acc);border-radius:var(--r);padding:14px;background:var(--card);margin:12px 0;animation:chPulse 2.4s infinite}
.ch .clock{font:700 1.8rem ui-monospace,monospace;letter-spacing:.04em}
.ch .row{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;animation:chUp .35s both}
.ch .row.me{background:var(--acc-bg);font-weight:600}
.ch .row .bar2{flex:1;height:10px;border-radius:99px;background:var(--line);overflow:hidden}
.ch .row .bar2 i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--ok));border-radius:99px;transition:width .7s}
.ch .medal{width:2rem;text-align:center;font-size:1.3rem}
.ch .ach{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px;animation:chUp .4s both}
.ch .ach.got{border-color:var(--ok)}.ch .ach .ico{font-size:2rem}
.ch .ach.locked .ico{filter:grayscale(1);opacity:.5}
.ch .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:12px 20px;border-radius:99px;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:50;animation:chToast .35s both;font-weight:600}
.ch .bit{position:fixed;top:-12px;width:10px;height:14px;border-radius:2px;z-index:60;pointer-events:none;animation:chFall linear forwards}
.ch .skel{height:110px;border-radius:var(--r);background:linear-gradient(90deg,var(--line),var(--card),var(--line));background-size:200% 100%;animation:chShim 1.2s infinite}
.ch .empty{text-align:center;padding:32px 12px;font-size:1.1rem}.ch .empty b{display:block;font-size:2.6rem}
@keyframes chUp{from{opacity:0;transform:translateY(10px)}}
@keyframes chWig{50%{transform:rotate(14deg) scale(1.2)}}
@keyframes chPulse{50%{box-shadow:0 0 0 6px var(--acc-bg)}}
@keyframes chToast{from{opacity:0;transform:translate(-50%,20px)}}
@keyframes chShim{to{background-position:-200% 0}}
@keyframes chFall{to{transform:translateY(105vh) rotate(720deg);opacity:.8}}
@media (prefers-reduced-motion:reduce){.ch *{animation:none!important;transition:none!important}}
`;

function Confetti({ n }: { n: number }) {
  const bits = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ i, l: Math.random() * 100, d: Math.random() * 0.5, t: 1.6 + Math.random() * 1.6, c: `hsl(${Math.floor(Math.random() * 360)} 85% 60%)` })), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{bits.map((b) => <i key={b.i} className="bit" style={{ left: `${b.l}%`, background: b.c, animationDuration: `${b.t}s`, animationDelay: `${b.d}s` }} />)}</>;
}

// Members see the chores, everyone's hours and achievements, and log their own time.
export default function Chores() {
  const [tab, setTab] = useState("todo"), [period, setPeriod] = useState("this_month"), [msg, setMsg] = useState(""), [filter, setFilter] = useState("all");
  const [d, setD] = useState<Data | null>(null), [ach, setAch] = useState<any[] | null>(null), [stats, setStats] = useState<any>(null), [mine, setMine] = useState<Hour[] | null>(null);
  const [fin, setFin] = useState<{ id: number; minutes: string } | null>(null), [log, setLog] = useState<{ id: number; minutes: string } | null>(null);
  const [toast, setToast] = useState(""), [boom, setBoom] = useState(0), [now, setNow] = useState(() => Math.floor(Date.now() / 1000)), [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const load = useCallback((p = period) => rpc("overview", { period: p }).then(setD, (e) => setMsg(e.message)), [period]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { rpc("overview", { period: "this_month" }).then((x) => setMine(x.hours), () => {}); }, [d?.mine.length]);
  useEffect(() => { if (tab === "fame" && !ach) rpc("achievements").then(setAch, (e) => setMsg(e.message)); if (tab === "stats" && !stats) rpc("stats").then(setStats, (e) => setMsg(e.message)); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const cheer = (t: string, party = true) => { setToast(t); if (party) setBoom((b) => b + 1); clearTimeout(timer.current); timer.current = setTimeout(() => { setToast(""); }, 3200); };
  // Runs an action; on success shows a toast (and confetti for finished work), refreshes everything.
  const run = async (fn: () => Promise<unknown>, ok?: string, party = true) => {
    setMsg(""); setBusy(true);
    try { await fn(); setAch(null); setStats(null); await load(); if (tab === "fame") rpc("achievements").then(setAch); if (ok) cheer(ok, party); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await rpc("log", { chore_id: log!.id, minutes: Number(log!.minutes) }); setLog(null); }, CHEERS[Math.floor(Math.random() * CHEERS.length)]); };
  const done = (s: Shift) => run(() => rpc("finish", { shift_id: s.id, minutes: fin?.id === s.id ? Number(fin.minutes) : undefined }).catch((e) => { if (/open over/.test(e.message)) setFin({ id: s.id, minutes: "60" }); throw e; }), CHEERS[Math.floor(Math.random() * CHEERS.length)]);

  const chores = useMemo(() => {
    const rank = { late: 0, soon: 1, free: 2, ok: 3 } as const;
    return (d?.chores ?? []).filter((c) => filter === "all" || (filter === "free" ? !c.being_done_by.length : urgency(c) === filter)).sort((a, b) => rank[urgency(a)] - rank[urgency(b)] || (b.overdue_days ?? -999) - (a.overdue_days ?? -999));
  }, [d, filter]);

  if (!d) return <div className="ch"><style>{CSS}</style>{msg ? <p role="alert" style={{ color: "var(--bad)" }}>{msg}</p> : <div style={{ display: "grid", gap: 12 }}><div className="skel" /><div className="skel" /><div className="skel" /></div>}</div>;
  const sp = stats?.[period];
  const myMonth = mine?.find((h) => h.user_id === d.me)?.hours ?? 0, GOAL = 4, pct = Math.min(100, (myMonth / GOAL) * 100);
  const late = d.chores.filter((c) => urgency(c) === "late").length, max = Math.max(1, ...d.hours.map((h) => h.hours));
  const first = d.name?.split(" ")[0] || "friend";
  return (
    <div className="ch">
      <style>{CSS}</style>
      {boom > 0 && <Confetti key={boom} n={boom} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <div className="hero">
        <div className="ring" style={{ "--p": pct } as React.CSSProperties} aria-hidden><span>{myMonth >= GOAL ? "🌟" : d.mine.length ? "⚡" : "👋"}</span></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="big">Hey {first}!</div>
          <p className="sub" style={{ margin: "4px 0 8px" }}>{d.mine.length ? "You're on the clock. Thanks for pitching in!" : late ? `${late} ${late === 1 ? "chore is" : "chores are"} running late. Want to be a hero?` : "Everything's in good shape. Grab a job and be a hero anyway."}</p>
          <span className="pill">⏱️ {hrs(myMonth)} this month</span> {myMonth < GOAL && <span className="pill">🎯 {hrs(GOAL - myMonth)} to your {GOAL}h goal</span>}{myMonth >= GOAL && <span className="pill">🌟 {GOAL}h goal reached!</span>}
        </div>
      </div>
      {msg && <p role="alert" style={{ color: "var(--bad)" }}>{msg}</p>}
      <nav className="bar chips">{TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} className={tab === k ? "primary" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === "todo" && (
        <>
          {d.mine.map((s) => {
            const sec = Math.max(0, now - s.started_at);
            return (
              <div key={s.id} className="on">
                <div className="sub" style={{ margin: 0 }}>⚡ You're on</div>
                <h2 style={{ margin: "2px 0" }}>{s.chore}</h2>
                <div className="clock" aria-label={`${mins(s.started_at, now)} minutes so far`}>{clock(sec)}</div>
                <div className="acts">
                  <button className="primary" disabled={busy} onClick={() => done(s)}>✅ I'm done!</button>
                  {fin?.id === s.id && <label>Minutes it took<input type="number" min={1} max={960} value={fin.minutes} onChange={(e) => setFin({ id: s.id, minutes: e.target.value })} style={{ width: 90 }} /></label>}
                </div>
              </div>
            );
          })}
          <nav className="chips" aria-label="Filter chores">{FILTERS.map(([k, l]) => <button key={k} aria-pressed={filter === k} className={filter === k ? "primary" : ""} onClick={() => setFilter(k)}>{l}</button>)}</nav>
          <div className="grid">
            {chores.map((c, i) => {
              const u = urgency(c), full = c.every_days ? Math.max(0, Math.min(100, 100 - ((-(c.overdue_days ?? 0)) / c.every_days) * 100)) : 0;
              return (
                <div key={c.id} className={`c ${u}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <span className="ico" aria-hidden>{iconFor(c.name)}</span>
                    <span className="mood" aria-hidden style={{ fontSize: "1.3rem" }}>{MOOD[u]}</span>
                  </div>
                  <h3>{c.name}</h3>
                  <div><span className="tag">{every(c.every_days)}</span> <span className="tag" style={{ color: u === "late" ? "var(--bad)" : undefined, fontWeight: u === "late" || u === "soon" ? 600 : 400 }}>{dueText(c)}</span></div>
                  {c.every_days !== null && <div className="meter" aria-hidden><i style={{ width: `${full}%` }} /></div>}
                  {c.notes && <div className="sub" style={{ margin: 0 }}>{c.notes}</div>}
                  <div className="sub" style={{ margin: 0 }}>{c.last_done_at ? `Last: ${when(c.last_done_at)} by ${c.last_by}` : "Nobody has done this yet. Be the first!"}</div>
                  {c.being_done_by.length > 0 && <div><span className="pill">👷 {c.being_done_by.join(", ")} {c.being_done_by.length === 1 ? "is" : "are"} on it</span></div>}
                  <div className="acts">
                    <button className="primary" disabled={busy} onClick={() => run(() => rpc("start", { chore_id: c.id }), "Timer's running. Go get 'em! ⚡", false)}>▶ I'm starting this</button>
                    <button onClick={() => setLog(log?.id === c.id ? null : { id: c.id, minutes: "30" })}>✍️ I did this…</button>
                  </div>
                  {log?.id === c.id && (
                    <form onSubmit={submit} className="quick">
                      {[15, 30, 45, 60, 90].map((m) => <button type="button" key={m} aria-pressed={log.minutes === String(m)} onClick={() => setLog({ ...log, minutes: String(m) })}>{m}m</button>)}
                      <input type="number" aria-label="Minutes" min={1} max={960} value={log.minutes} onChange={(e) => setLog({ ...log, minutes: e.target.value })} required style={{ width: 70 }} />
                      <button className="primary" disabled={busy}>Log it 🎉</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
          {!chores.length && <div className="empty"><b>{d.chores.length ? "🎊" : "🫧"}</b>{d.chores.length ? "Nothing here. That's a good sign!" : "No chores yet."}</div>}
        </>
      )}
      {tab !== "todo" && tab !== "fame" && <nav className="chips" aria-label="Period">{PERIODS.map(([k, l]) => <button key={k} aria-pressed={period === k} className={period === k ? "primary" : ""} onClick={() => { setPeriod(k); load(k); }}>{l}</button>)}</nav>}
      {tab === "hours" && (
        <div className="card">
          {d.hours.map((h, i) => (
            <div key={h.name + i} className={`row${h.user_id === d.me ? " me" : ""}`} style={{ animationDelay: `${Math.min(i, 15) * 40}ms` }}>
              <span className="medal">{MEDALS[i] ?? i + 1}</span>
              <span style={{ minWidth: 110 }}>{h.name}{h.user_id === d.me && " (you)"}</span>
              <span className="bar2"><i style={{ width: `${(h.hours / max) * 100}%` }} /></span>
              <span className="tag">{hrs(h.hours)}</span><span className="tag">{h.times} {h.times === 1 ? "time" : "times"}</span>
            </div>
          ))}
          {!d.hours.length && <div className="empty"><b>🌱</b>Nobody has logged time in this period. Be the first!</div>}
        </div>
      )}
      {tab === "fame" && (
        <>
          {!ach && <div className="skel" />}
          {ach && !ach.length && <div className="empty"><b>🏆</b>No achievements yet.</div>}
          <div className="grid">
            {(ach ?? []).map((a, i) => (
              <div key={a.id} className={`ach ${a.earned.length ? "got" : "locked"}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                <span className="ico">{a.icon}</span> <strong>{a.title}</strong>
                <div><span className="tag">{a.goal} {measureText(a.measure)}</span><span className="tag">{a.task ?? "any chore"}</span></div>
                {a.note && <div className="sub" style={{ margin: "4px 0" }}>{a.note}</div>}
                <div style={{ margin: "6px 0" }}>{a.earned.length ? a.earned.map((e: any) => <span className="tag" key={e.who + e.at}>🏆 {e.who} · {when(e.at)}</span>) : <span className="sub">🔒 Not earned yet. Could be you!</span>}</div>
                {a.close.length > 0 && <div className="sub" style={{ margin: 0 }}>Closest: {a.close.map((c: any) => `${c.who} (${c.have})`).join(", ")}</div>}
              </div>
            ))}
          </div>
        </>
      )}
      {tab === "stats" && (
        <div className="card">
          {!sp ? <div className="skel" /> : (
            <>
              <p className="sub">{sp.hours} hours over {sp.sessions} shifts by {sp.volunteers} {sp.volunteers === 1 ? "person" : "people"}{sp.on_time !== null && `, ${sp.on_time}% of scheduled chores on time`}.</p>
              {sp.awards.map((a: any, i: number) => { const [t, text] = awardText(a); return <div key={i} className="row" style={{ animationDelay: `${Math.min(i, 15) * 40}ms` }}><span className="tag" style={{ fontWeight: 600 }}>{t}</span> {text}</div>; })}
              {!sp.awards.length && <div className="empty"><b>🎈</b>Nothing to celebrate yet.</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
