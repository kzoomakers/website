"use client";
import { useState } from "react";
import "./training.css";

// How a member sees and answers one question. Used by the author's preview now and by real attempts next. It is only ever given the member view (no answer key).
export type MemberQ = { id: number; type: string; prompt_html: string; points: number; view: any };

/** Prompts are sanitized HTML, or plain text (kept as written). */
export function Rich({ html, className }: { html: string; className?: string }) {
  return /^\s*</.test(html) ? <div className={className} dangerouslySetInnerHTML={{ __html: html }} /> : <p className={className} style={{ whiteSpace: "pre-wrap", margin: 0 }}>{html}</p>;
}

const pctStyle = (z: { x: number; y: number; w: number; h: number }) => ({ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` });

function Diagram({ v, value, onChange, disabled }: { v: any; value: Record<string, string>; onChange: (x: Record<string, string>) => void; disabled?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null), [list, setList] = useState(false), [over, setOver] = useState<string | null>(null);
  const val = value ?? {}, text = (id?: string) => v.labels.find((l: any) => l.id === id)?.text ?? "";
  const put = (zone: string, label: string | null) => {
    const next = { ...val };
    if (label === null) delete next[zone];
    else { if (!v.reuse) for (const k of Object.keys(next)) if (next[k] === label) delete next[k]; next[zone] = label; }
    onChange(next);
  };
  const used = new Set(Object.values(val));
  return (
    <div>
      <p className="sub" style={{ margin: "0 0 8px" }}>Pick a name, then pick the numbered area it belongs to (or drag it there). Pick a filled area to clear it. <button type="button" onClick={() => setList(!list)}>{list ? "Show the picture" : "Use a list instead"}</button></p>
      {!list ? (
        <>
          <div className="tq-diagram">
            <img src={v.image} alt={v.alt} draggable={false} />
            {v.zones.map((z: any, i: number) => (
              <button key={z.id} type="button" className="tq-zone" style={pctStyle(z)} disabled={disabled} data-filled={val[z.id] ? "" : undefined} data-over={over === z.id ? "" : undefined}
                aria-label={`Area ${i + 1}: ${val[z.id] ? text(val[z.id]) : "empty"}`}
                onClick={() => { if (picked) { put(z.id, picked); setPicked(null); } else if (val[z.id]) put(z.id, null); }}
                onDragOver={(e) => { e.preventDefault(); setOver(z.id); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); const l = e.dataTransfer.getData("text/plain"); if (v.labels.some((x: any) => x.id === l)) put(z.id, l); }}>
                <span className="n">{i + 1}</span>{val[z.id] ? text(val[z.id]) : ""}
              </button>
            ))}
          </div>
          <div className="tq-bank" role="group" aria-label="Names">
            {v.labels.map((l: any) => (
              <button key={l.id} type="button" draggable={!disabled} disabled={disabled} aria-pressed={picked === l.id} data-used={!v.reuse && used.has(l.id) ? "" : undefined}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)} onClick={() => setPicked(picked === l.id ? null : l.id)}>{l.text}</button>
            ))}
          </div>
        </>
      ) : (
        <div className="qe-grid">
          <div className="tq-diagram"><img src={v.image} alt={v.alt} draggable={false} />{v.zones.map((z: any, i: number) => <span key={z.id} className="tq-zone" style={pctStyle(z)}><span className="n">{i + 1}</span></span>)}</div>
          {v.zones.map((z: any, i: number) => (
            <label key={z.id}>Area {i + 1}
              <select disabled={disabled} value={val[z.id] ?? ""} onChange={(e) => put(z.id, e.target.value || null)}><option value="">(choose)</option>{v.labels.map((l: any) => <option key={l.id} value={l.id}>{l.text}</option>)}</select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Hotspot({ v, value, onChange, disabled }: { v: any; value: { x: number; y: number } | undefined; onChange: (x: { x: number; y: number }) => void; disabled?: boolean }) {
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));
  return (
    <div>
      <p className="sub" style={{ margin: "0 0 8px" }}>Click the spot, or focus the picture and use the arrow keys (hold Shift for bigger steps).</p>
      <div className="tq-diagram tq-hot" tabIndex={disabled ? -1 : 0} role="group" aria-label={`${v.alt}. ${value ? `Marker at ${value.x} percent across, ${value.y} percent down.` : "No marker placed."}`}
        onClick={(e) => { if (disabled) return; const r = e.currentTarget.getBoundingClientRect(); onChange({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) }); }}
        onKeyDown={(e) => { const d = e.shiftKey ? 10 : 2, m = ({ ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] } as any)[e.key]; if (!m || disabled) return; e.preventDefault(); const p = value ?? { x: 50, y: 50 }; onChange({ x: clamp(p.x + m[0]), y: clamp(p.y + m[1]) }); }}>
        <img src={v.image} alt="" draggable={false} />
        {value && <span className="tq-pin" style={{ left: `${value.x}%`, top: `${value.y}%` }} />}
      </div>
    </div>
  );
}

export default function QuestionView({ q, value, onChange, disabled, n }: { q: MemberQ; value: any; onChange: (v: any) => void; disabled?: boolean; n?: number }) {
  const v = q.view, name = `q${q.id}`;
  let body;
  switch (q.type) {
    case "mc_single":
      body = <fieldset className="tq-opts" disabled={disabled}>{v.choices.map((c: any) => <label key={c.i}><input type="radio" name={name} checked={value === c.i} onChange={() => onChange(c.i)} />{c.text}</label>)}</fieldset>; break;
    case "mc_multi":
      body = <fieldset className="tq-opts" disabled={disabled}><legend className="sub">Choose all that apply.</legend>{v.choices.map((c: any) => { const on: number[] = value ?? []; return <label key={c.i}><input type="checkbox" checked={on.includes(c.i)} onChange={(e) => onChange(e.target.checked ? [...on, c.i] : on.filter((x) => x !== c.i))} />{c.text}</label>; })}</fieldset>; break;
    case "true_false":
      body = <fieldset className="tq-opts" disabled={disabled}>{[true, false].map((b) => <label key={String(b)}><input type="radio" name={name} checked={value === b} onChange={() => onChange(b)} />{b ? "True" : "False"}</label>)}</fieldset>; break;
    case "image_label": body = <Diagram v={v} value={value} onChange={onChange} disabled={disabled} />; break;
    case "hotspot": body = <Hotspot v={v} value={value} onChange={onChange} disabled={disabled} />; break;
    case "match":
      body = <div className="qe-grid">{v.left.map((l: any) => <label key={l.id}>{l.text}<select disabled={disabled} value={value?.[l.id] ?? ""} onChange={(e) => onChange({ ...value, [l.id]: e.target.value })}><option value="">(choose)</option>{v.right.map((r: any) => <option key={r.id} value={r.id}>{r.text}</option>)}</select></label>)}</div>; break;
    case "order": {
      const ids: string[] = value ?? v.items.map((x: any) => x.id), by = new Map<string, string>(v.items.map((x: any) => [x.id, x.text] as [string, string])), move = (i: number, d: number) => { const a = ids.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; onChange(a); };
      body = <><p className="sub" style={{ margin: "0 0 8px" }}>Put these in the right order, first at the top.</p><ol className="tq-ord">{ids.map((id, i) => <li key={id}><span>{by.get(id)}</span><button type="button" disabled={disabled || i === 0} aria-label={`Move “${by.get(id)}” up`} onClick={() => move(i, -1)}>↑</button><button type="button" disabled={disabled || i === ids.length - 1} aria-label={`Move “${by.get(id)}” down`} onClick={() => move(i, 1)}>↓</button></li>)}</ol></>; break;
    }
    case "fill_blank": {
      const parts = String(v.text).split(/(\{\{\d+\}\})/), vals: any[] = value ?? [];
      body = <p style={{ lineHeight: 2.2, margin: 0 }}>{parts.map((p, i) => { const m = /^\{\{(\d+)\}\}$/.exec(p); if (!m) return <span key={i}>{p}</span>; const k = +m[1] - 1; return <select key={i} aria-label={`Blank ${m[1]}`} disabled={disabled} value={vals[k] ?? ""} onChange={(e) => { const a = vals.slice(); a[k] = e.target.value === "" ? -1 : +e.target.value; onChange(a); }}><option value="">(choose)</option>{v.slots[k]?.choices.map((c: any) => <option key={c.i} value={c.i}>{c.text}</option>)}</select>; })}</p>; break;
    }
    case "short_text": body = <input type="text" aria-label="Your answer" maxLength={200} disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 420, width: "100%" }} />; break;
    case "numeric": body = <span><input type="text" inputMode="decimal" aria-label="Your answer" maxLength={30} disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ width: 140 }} /> {v.unit}</span>; break;
    default: body = null;
  }
  return (
    <div className="tq">
      <div className="tq-prompt">{n !== undefined && <b>{n}. </b>}<Rich html={q.prompt_html} className="tq-p" /></div>
      <div className="sub" style={{ margin: "0 0 8px", fontSize: 13 }}>{q.points} point{q.points === 1 ? "" : "s"}</div>
      {body}
    </div>
  );
}
