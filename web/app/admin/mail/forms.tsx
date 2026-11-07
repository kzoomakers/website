"use client";
import { useCallback, useEffect, useState } from "react";
import { rpc, type State } from "./api";

type Form = { id?: number; name: string; kind: string; enabled: boolean; lists: number[]; heading: string; body: string; button: string; success: string; delay: number; color: string; ask_name: boolean };
const KINDS: [string, string, string][] = [["popup", "Pop-up", "Centred over the page"], ["slidein", "Slide-in", "Corner card"], ["bar", "Fixed bar", "Strip along the bottom"], ["inline", "Below pages", "At the end of every page"]];
const NEW: Form = { name: "", kind: "popup", enabled: true, lists: [], heading: "Stay in the loop", body: "Get news and events in your inbox.", button: "Subscribe", success: "You're on the list. Thank you!", delay: 8, color: "#2f6fed", ask_name: false };

export default function Forms({ s }: { s: State; reload: () => void }) {
  const [forms, setForms] = useState<(Form & { id: number })[]>([]);
  const [f, setF] = useState<Form | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => rpc("forms").then(setForms).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const save = async (x: Form) => { try { await rpc("saveForm", { form: x }); setF(null); setMsg(""); load(); } catch (e: any) { setMsg(e.message); } };
  const names = (ids: number[]) => ids.map((i) => s.lists.find((l) => l.id === i)?.name).filter(Boolean).join(", ");
  if (f) {
    const set = (p: Partial<Form>) => setF({ ...f, ...p });
    return (
      <>
        <h1>{f.id ? "Edit form" : "New form"}</h1>
        {msg && <p className="err" role="alert">{msg}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)", gap: 20, alignItems: "start" }}>
          <div className="card" style={{ padding: 16 }}>
            <label className="field"><span>Form name (only you see this)</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <div className="field"><span>Subscribe people to</span>{s.lists.map((l) => <label className="in" key={l.id}><input type="checkbox" checked={f.lists.includes(l.id)} onChange={(e) => set({ lists: e.target.checked ? [...f.lists, l.id] : f.lists.filter((x) => x !== l.id) })} />{l.name}</label>)}</div>
            <div className="field"><span>Where it appears</span>{KINDS.map(([k, label, hint]) => <label className="in" key={k} title={hint}><input type="radio" checked={f.kind === k} onChange={() => set({ kind: k })} />{label}</label>)}</div>
            {f.kind !== "inline" && <label className="field"><span>Show after (seconds)</span><input type="number" min={0} max={120} style={{ width: 90 }} value={f.delay} onChange={(e) => set({ delay: +e.target.value })} /></label>}
            <label className="field"><span>Heading</span><input value={f.heading} onChange={(e) => set({ heading: e.target.value })} /></label>
            <label className="field"><span>Text</span><textarea rows={3} value={f.body} onChange={(e) => set({ body: e.target.value })} /></label>
            <label className="in"><input type="checkbox" checked={f.ask_name} onChange={(e) => set({ ask_name: e.target.checked })} />Also ask for their name</label>
            <label className="field"><span>Button text</span><input value={f.button} onChange={(e) => set({ button: e.target.value })} /></label>
            <label className="field"><span>Message after signing up</span><input value={f.success} onChange={(e) => set({ success: e.target.value })} /></label>
            <label className="field"><span>Colour</span><input type="color" value={f.color} onChange={(e) => set({ color: e.target.value })} /></label>
            <label className="in"><input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Active on the website</label>
            <div className="bar" style={{ marginTop: 12 }}><button className="pri" onClick={() => save(f)}>Save</button><button onClick={() => { setF(null); setMsg(""); }}>Cancel</button></div>
          </div>
          <div>
            <p className="sub">Preview</p>
            <div style={{ background: "#fff", color: "#1c2024", borderRadius: 12, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,.25)", font: "15px/1.4 system-ui,sans-serif" }}>
              <strong style={{ fontSize: 18 }}>{f.heading}</strong><p style={{ margin: "6px 0 12px" }}>{f.body}</p>
              {f.ask_name && <input disabled placeholder="Your name" style={{ width: "100%", padding: 10, boxSizing: "border-box", marginBottom: 8 }} />}
              <input disabled placeholder="you@example.com" style={{ width: "100%", padding: 10, boxSizing: "border-box", marginBottom: 8 }} />
              <div style={{ background: f.color, color: "#fff", textAlign: "center", padding: 10, borderRadius: 6, fontWeight: 700 }}>{f.button}</div>
            </div>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <h1>Forms <button className="pri" onClick={() => setF({ ...NEW, lists: s.lists[0] ? [s.lists[0].id] : [] })}>New form</button></h1>
      <p className="sub">Signup forms shown on the public website. A visitor who closes one won't see it again for 30 days.</p>
      {msg && <p className="err" role="alert">{msg}</p>}
      <table className="mp-table">
        <thead><tr><th>Name</th><th>Type</th><th>Lists</th><th>Status</th></tr></thead>
        <tbody>
          {forms.map((x) => (
            <tr key={x.id}>
              <td><b>{x.name}</b>
                <div className="mp-act"><button onClick={() => setF(x)}>Edit</button><button onClick={() => save({ ...x, enabled: !x.enabled })}>{x.enabled ? "Deactivate" : "Activate"}</button>
                  <button className="bad" onClick={async () => { if (confirm(`Delete the form "${x.name}"?`)) { await rpc("deleteForm", { id: x.id }); load(); } }}>Delete</button></div></td>
              <td>{KINDS.find((k) => k[0] === x.kind)?.[1]}</td><td><small>{names(x.lists)}</small></td>
              <td><span className={"pill" + (x.enabled ? " sent" : " draft")}>{x.enabled ? "Active" : "Inactive"}</span></td>
            </tr>))}
        </tbody>
      </table>
      {!forms.length && <p className="sub">No forms yet — visitors have no way to subscribe.</p>}
    </>
  );
}
