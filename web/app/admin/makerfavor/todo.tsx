"use client";
import Notice from "@/components/notice";
import { useMemo, useState } from "react";
import { confirmDialog, promptDialog } from "@/components/dialog";
import { choreName, ROOM } from "@/lib/chores-calc";
import { chores } from "./rpc";
import { dueText, every, when } from "./format";

type Row = { id: number; name: string; area: string; station: string; task: string; aliases: string[]; every_days: number | null; notes: string; due_at: number | null; overdue_days: number | null; last_done_at: number | null; last_by: string | null; being_done_by: string[] };
type Draft = { id: number; area: string; station: string; task: string; every_days: string; aliases: string; notes: string };
const BLANK: Draft = { id: 0, area: "", station: "", task: "", every_days: "", aliases: "", notes: "" };
const HOW_OFTEN: [string, string][] = [["1", "Every day"], ["7", "Every week"], ["14", "Every 2 weeks"], ["30", "Every month"], ["91", "Every 3 months"], ["182", "Twice a year"], ["365", "Once a year"], ["", "Only when needed"]];
const STEPS = ["Where", "What", "Task", "How often"];
const uniq = (a: string[]) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y));

const CSS = `
.mf .tree{display:grid;gap:14px;margin:12px 0}
.mf .area{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.mf .area>header,.mf .stn>header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mf .area>header h2{margin:0;font-size:1.25rem;flex:1}
.mf .stn{margin-top:12px;padding-left:12px;border-left:3px solid var(--acc-bg)}
.mf .stn>header h3{margin:0;font-size:1rem;flex:1;color:var(--mut)}
.mf .t{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line)}
.mf .t .nm{flex:1;min-width:180px}.mf .t .nm b{display:block}
.mf .ghost{border:0;background:none;color:var(--acc);padding:6px 10px;border-radius:99px;cursor:pointer;font:inherit}
.mf .ghost:hover{background:var(--acc-bg)}
.mf .hero{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0}
.mf .hero .big{font-size:1rem;padding:12px 20px;border-radius:99px}
.mf .shade{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:80;display:flex;align-items:flex-end;justify-content:center;animation:mfFade .2s both}
.mf .sheet{background:var(--card);color:var(--ink);width:100%;max-width:560px;max-height:92dvh;overflow:auto;border-radius:22px 22px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));animation:mfUp .3s cubic-bezier(.2,.9,.3,1) both;box-shadow:0 -10px 40px rgba(0,0,0,.3)}
@media (min-width:700px){.mf .shade{align-items:center}.mf .sheet{border-radius:22px}}
.mf .dots{display:flex;gap:6px;margin:0 0 14px}.mf .dots button{flex:1;border:0;height:6px;border-radius:99px;background:var(--line);padding:0;cursor:pointer}.mf .dots button.on{background:var(--acc)}.mf .dots button.past{background:var(--ok)}
.mf .sheet h2{margin:0 0 4px;font-size:1.4rem}
.mf .opts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.mf .opts button{font:inherit;padding:12px 16px;min-height:48px;border-radius:14px;border:1.5px solid var(--btn-bd);background:var(--card);color:var(--ink);cursor:pointer;transition:transform .12s}
.mf .opts button:active{transform:scale(.95)}
.mf .opts button[aria-pressed=true]{border-color:var(--acc);background:var(--acc-bg);font-weight:600}
.mf .sheet input,.mf .sheet textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px;border-radius:12px;min-height:48px}
.mf .trail{padding:10px 14px;border-radius:12px;background:var(--acc-bg);margin:12px 0;font-weight:600}
.mf .nav{display:flex;gap:8px;justify-content:space-between;margin-top:16px}
.mf .nav button{min-height:48px;padding:0 22px;border-radius:99px;font:inherit}
@keyframes mfUp{from{transform:translateY(40px);opacity:0}}@keyframes mfFade{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.mf *{animation:none!important;transition:none!important}}
`;

// The wizard: four short steps (where, what, task, how often); the dots on top jump anywhere, so editing is the same sheet.
function Wizard({ rows, start, onSave, onClose }: { rows: Row[]; start: Draft; onSave: (d: Draft) => Promise<void>; onClose: () => void }) {
  const [d, setD] = useState(start), [step, setStep] = useState(start.id ? 2 : start.area ? (start.station ? 2 : 1) : 0), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [newArea, setNewArea] = useState(false), [newStn, setNewStn] = useState(false);
  const areas = useMemo(() => uniq(rows.map((r) => r.area)), [rows]);
  const stations = useMemo(() => uniq([ROOM, ...rows.filter((r) => r.area === d.area).map((r) => r.station)]), [rows, d.area]);
  const upd = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const ok = [!!d.area.trim(), true, !!d.task.trim(), true];
  const preview = choreName(d.area || "…", d.station || ROOM, d.task || "…");
  const go = (n: number) => { setErr(""); setStep(Math.max(0, Math.min(3, n))); };
  const next = () => { if (!ok[step]) return setErr(step === 0 ? "Pick an area, or add a new one." : "Say what the task is."); go(step + 1); };
  const finish = async () => { setBusy(true); try { await onSave(d); } catch (e: any) { setErr(e.message); setBusy(false); } };
  return (
    <div className="shade" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={d.id ? "Edit task" : "Add a task"} onSubmit={(e) => { e.preventDefault(); step < 3 ? next() : finish(); }}>
        <div className="dots" aria-label="Steps">{STEPS.map((s, i) => <button type="button" key={s} className={i === step ? "on" : i < step ? "past" : ""} aria-label={`Step ${i + 1}: ${s}`} onClick={() => (i <= step || ok.slice(0, i).every(Boolean)) && go(i)} />)}</div>
        <div className="sub" style={{ margin: 0 }}>Step {step + 1} of 4</div>
        {step === 0 && <>
          <h2>Where is it?</h2><p className="sub">The area is the room or zone, like Wood Shop or Meeting Area.</p>
          <div className="opts">
            {areas.map((a) => <button type="button" key={a} aria-pressed={d.area === a && !newArea} onClick={() => { upd({ area: a }); setNewArea(false); }}>{a}</button>)}
            <button type="button" aria-pressed={newArea || (!!d.area && !areas.includes(d.area))} onClick={() => { setNewArea(true); upd({ area: "" }); }}>＋ New area</button>
          </div>
          {(newArea || (d.area && !areas.includes(d.area))) && <input autoFocus aria-label="New area name" placeholder="Name it, like Concrete Room" maxLength={60} value={d.area} onChange={(e) => upd({ area: e.target.value })} />}
        </>}
        {step === 1 && <>
          <h2>What is it about?</h2><p className="sub">A station is a machine or spot inside {d.area || "the area"}, like Table Saw or Lasers. Pick Room if the job covers the whole area.</p>
          <div className="opts">
            {stations.map((s) => <button type="button" key={s} aria-pressed={(d.station || ROOM) === s && !newStn} onClick={() => { upd({ station: s }); setNewStn(false); }}>{s === ROOM ? "🏠 Whole room" : s}</button>)}
            <button type="button" aria-pressed={newStn || !stations.includes(d.station || ROOM)} onClick={() => { setNewStn(true); upd({ station: "" }); }}>＋ New station</button>
          </div>
          {(newStn || !stations.includes(d.station || ROOM)) && <input autoFocus aria-label="New station name" placeholder="Name it, like Lasers" maxLength={60} value={d.station} onChange={(e) => upd({ station: e.target.value })} />}
        </>}
        {step === 2 && <>
          <h2>What needs doing?</h2><p className="sub">Start with a verb: Sweep Floor, Empty, Clean SP500 Bed.</p>
          <input autoFocus aria-label="Task" placeholder="Sweep Floor" maxLength={60} value={d.task} onChange={(e) => upd({ task: e.target.value })} list="mf-tasks" required />
          <datalist id="mf-tasks">{uniq(rows.map((r) => r.task)).map((t) => <option key={t} value={t} />)}</datalist>
          <label style={{ display: "block", marginTop: 12 }}>Notes for the volunteer (optional)<textarea rows={3} maxLength={1000} value={d.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Anything that helps a first-timer do it right" /></label>
        </>}
        {step === 3 && <>
          <h2>How often?</h2><p className="sub">When it comes due, it floats to the top of everyone's list.</p>
          <div className="opts">{HOW_OFTEN.map(([n, l]) => <button type="button" key={l} aria-pressed={d.every_days === n} onClick={() => upd({ every_days: n })}>{l}</button>)}</div>
          <label>Or every this many days<input type="number" min={1} max={366} inputMode="numeric" value={d.every_days} onChange={(e) => upd({ every_days: e.target.value })} placeholder="as needed" /></label>
          <label style={{ display: "block", marginTop: 12 }}>Other names people say (optional)<input value={d.aliases} onChange={(e) => upd({ aliases: e.target.value })} placeholder="dust bin, sawdust" /></label>
        </>}
        <div className="trail" aria-live="polite">{preview}</div>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="nav">
          <button type="button" onClick={() => (step ? go(step - 1) : onClose())}>{step ? "Back" : "Cancel"}</button>
          {step < 3 ? <button className="pri">Next</button> : <button className="pri" disabled={busy || !d.area.trim() || !d.task.trim()}>{d.id ? "Save task" : "Add task"}</button>}
        </div>
      </form>
    </div>
  );
}

export default function Todo({ initial, members }: { initial: Row[]; members: { id: number; name: string }[] }) {
  const [rows, setRows] = useState(initial), [wiz, setWiz] = useState<Draft | null>(null), [msg, setMsg] = useState(""), [done, setDone] = useState<{ id: number; user: string; minutes: string } | null>(null);
  const load = async () => setRows(await chores("list"));
  const run = async (f: () => Promise<unknown>) => { setMsg(""); try { await f(); await load(); } catch (e: any) { setMsg(e.message); } };
  const save = async (d: Draft) => { await chores("save", { chore: { ...d, id: d.id || undefined } }); await load(); setWiz(null); };
  const edit = (r: Row) => setWiz({ id: r.id, area: r.area, station: r.station, task: r.task, every_days: r.every_days ? String(r.every_days) : "", aliases: r.aliases.join(", "), notes: r.notes });
  const del = async (r: Row) => { if (await confirmDialog(`Put away "${r.name}"? The hours people gave to it stay counted.`, { ok: "Put away", danger: true })) run(() => chores("delete", { id: r.id })); };
  const finish = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await chores("logTime", { chore_id: done!.id, user_id: Number(done!.user), minutes: Number(done!.minutes) }); setDone(null); }); };
  const rename = async (area: string, station: string | null) => {
    const to = await promptDialog(station === null ? `Rename the area "${area}" everywhere it's used.` : `Rename the station "${station}" in ${area}.`, station ?? area, { ok: "Rename", title: "Rename" });
    if (to) run(() => chores("renameGroup", { area, station, to }));
  };
  const tree = useMemo(() => {
    const m = new Map<string, Map<string, Row[]>>();
    for (const r of rows) { const a = r.area || "Not filed yet", s = r.station || ROOM; ((m.get(a) ?? m.set(a, new Map()).get(a)!).get(s) ?? m.get(a)!.set(s, []).get(s)!).push(r); }
    return [...m].sort((x, y) => x[0].localeCompare(y[0])).map(([a, ss]) => [a, [...ss].sort((x, y) => (x[0] === ROOM ? -1 : y[0] === ROOM ? 1 : x[0].localeCompare(y[0])))] as const);
  }, [rows]);
  const task = (r: Row) => (
    <div key={r.id} className="t">
      <div className="nm"><b>{r.task || r.name}</b>
        <span className="tag">{every(r.every_days)}</span>
        <span className="tag" style={{ color: (r.overdue_days ?? -1) > 0 ? "var(--bad)" : undefined, fontWeight: (r.overdue_days ?? -1) >= 0 ? 600 : 400 }}>{dueText(r)}</span>
        <span className="tag">Last: {r.last_done_at ? `${when(r.last_done_at)} by ${r.last_by}` : "never"}</span>
        {r.being_done_by.length > 0 && <span className="tag" style={{ color: "var(--ok)" }}>On it: {r.being_done_by.join(", ")}</span>}
        {r.notes && <div className="sub" style={{ margin: "4px 0 0" }}>{r.notes}</div>}
      </div>
      <button onClick={() => setDone(done?.id === r.id ? null : { id: r.id, user: "", minutes: "30" })}>Mark done…</button>
      {r.due_at !== null && <button onClick={() => run(() => chores("snooze", { id: r.id, days: 7 }))}>Snooze a week</button>}
      <button onClick={() => edit(r)}>Edit</button>
      <button className="danger" onClick={() => del(r)}>Put away</button>
      {done?.id === r.id && (
        <form onSubmit={finish} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", flexBasis: "100%" }}>
          <label>Who<select value={done.user} onChange={(e) => setDone({ ...done, user: e.target.value })} required><option value="">Pick a member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Minutes<input type="number" min={1} max={960} value={done.minutes} onChange={(e) => setDone({ ...done, minutes: e.target.value })} required style={{ width: 90 }} /></label>
          <button className="pri">Log it</button>
        </form>
      )}
    </div>
  );
  return (
    <div className="mf">
      <style>{CSS}</style>
      <h1>MakerFavor™</h1>
      <p className="sub">Every chore lives in an area (Wood Shop), at a station (Table Saw), as a task (Lube Adjustment Gears). Overdue ones are read out by Computer at the space.</p>
      {msg && <Notice kind="error">{msg}</Notice>}
      <div className="hero"><button className="pri big" onClick={() => setWiz({ ...BLANK })}>＋ Add a task</button></div>
      <div className="tree">
        {tree.map(([area, stns]) => (
          <section key={area} className="area">
            <header>
              <h2>{area}</h2>
              {area !== "Not filed yet" && <button className="ghost" onClick={() => rename(area, null)}>Rename</button>}
              <button className="ghost" onClick={() => setWiz({ ...BLANK, area })}>＋ Task here</button>
            </header>
            {stns.map(([stn, list]) => (
              <div key={stn} className="stn">
                {stn !== ROOM || stns.length > 1 ? (
                  <header><h3>{stn === ROOM ? "🏠 Whole room" : stn}</h3>
                    {stn !== ROOM && <button className="ghost" onClick={() => rename(area, stn)}>Rename</button>}
                    <button className="ghost" onClick={() => setWiz({ ...BLANK, area, station: stn })}>＋ Task</button>
                  </header>
                ) : null}
                {list.map(task)}
              </div>
            ))}
          </section>
        ))}
        {!rows.length && <p className="sub">No tasks yet. Tap “Add a task” and the steps will walk you through it.</p>}
      </div>
      {wiz && <Wizard rows={rows} start={wiz} onSave={save} onClose={() => setWiz(null)} />}
    </div>
  );
}
