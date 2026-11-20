"use client";
import { useRef, useState } from "react";
import { alertDialog } from "@/components/dialog";
import Regions from "@/components/training/regions";
import { TYPE_LABEL, type QType } from "@/lib/training/blank";

export type EQ = { id?: number; qkey?: string; type: QType; prompt_html: string; points: number; config: any; feedback_html: string; required_correct: boolean };
type P = { q: EQ; set: (p: Partial<EQ>) => void; disabled?: boolean };
const uid = () => Math.random().toString(36).slice(2, 8);

function ImageField({ url, onUploaded, disabled }: { url: string; onUploaded: (u: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), ref = useRef<HTMLInputElement>(null);
  const up = async (f: File) => {
    setBusy(true);
    try { const fd = new FormData(); fd.set("file", f); const r = await fetch("/api/webmaster/training/image", { method: "POST", body: fd }); if (!r.ok) throw new Error(await r.text()); onUploaded((await r.json()).url); }
    catch (e: any) { alertDialog(e.message); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return <label>{url ? "Replace the picture" : "Upload the picture"} (JPG, PNG or WebP)<input ref={ref} type="file" accept="image/*" disabled={disabled || busy} onChange={(e) => e.target.files?.[0] && up(e.target.files[0])} />{busy && <span className="qe-status">Uploading…</span>}</label>;
}

const Strings = ({ items, onChange, add, disabled, mark }: { items: string[]; onChange: (x: string[]) => void; add: string; disabled?: boolean; mark?: (i: number) => React.ReactNode }) => (
  <div className="qe-grid">
    {items.map((t, i) => <div className="qe-row" key={i}>{mark?.(i)}<input type="text" aria-label={`${add} ${i + 1}`} maxLength={300} disabled={disabled} value={t} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} /><button type="button" disabled={disabled} aria-label={`Remove ${add} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button></div>)}
    <div><button type="button" disabled={disabled || items.length >= 12} onClick={() => onChange([...items, ""])}>+ Add {add.toLowerCase()}</button></div>
  </div>
);

function Choices({ q, set, disabled }: P) {
  const c = q.config, multi = q.type === "mc_multi", on = (i: number) => (multi ? c.correct.includes(i) : c.correct === i);
  return (
    <>
      <p className="sub" style={{ margin: "0 0 4px" }}>{multi ? "Tick every correct choice." : "Select the correct choice."}</p>
      <div className="qe-grid">
        {c.choices.map((t: string, i: number) => (
          <div className="qe-row" key={i}>
            <input type={multi ? "checkbox" : "radio"} name="correct" aria-label={`Choice ${i + 1} is correct`} disabled={disabled} checked={on(i)} onChange={(e) => set({ config: { ...c, correct: multi ? (e.target.checked ? [...c.correct, i] : c.correct.filter((x: number) => x !== i)) : i } })} />
            <input type="text" aria-label={`Choice ${i + 1}`} maxLength={300} disabled={disabled} value={t} onChange={(e) => set({ config: { ...c, choices: c.choices.map((x: string, j: number) => (j === i ? e.target.value : x)) } })} />
            <button type="button" disabled={disabled || c.choices.length <= 2} aria-label={`Remove choice ${i + 1}`} onClick={() => set({ config: { ...c, choices: c.choices.filter((_: any, j: number) => j !== i), correct: multi ? c.correct.filter((x: number) => x !== i).map((x: number) => (x > i ? x - 1 : x)) : c.correct === i ? -1 : c.correct > i ? c.correct - 1 : c.correct } })}>✕</button>
          </div>
        ))}
        <div><button type="button" disabled={disabled || c.choices.length >= 12} onClick={() => set({ config: { ...c, choices: [...c.choices, ""] } })}>+ Add choice</button></div>
      </div>
      {multi && <label>Scoring<select disabled={disabled} value={c.scoring} onChange={(e) => set({ config: { ...c, scoring: e.target.value } })}><option value="all">All or nothing: every right choice and no wrong one</option><option value="partial">Partial credit: wrong picks cancel right ones</option></select></label>}
    </>
  );
}

function Diagram({ q, set, disabled }: P) {
  const c = q.config, zones: any[] = c.zones, labels: any[] = c.labels;
  const setLabel = (i: number, text: string) => set({ config: { ...c, labels: labels.map((l, j) => (j === i ? { ...l, text } : l)) } });
  return (
    <div className="qe-grid">
      <ImageField url={c.image} disabled={disabled} onUploaded={(image) => set({ config: { ...c, image } })} />
      <label>Describe the picture for people who can't see it<input type="text" maxLength={300} disabled={disabled} value={c.alt} onChange={(e) => set({ config: { ...c, alt: e.target.value } })} /></label>
      {c.image ? <Regions image={c.image} alt={c.alt} regions={zones} newId={uid} disabled={disabled} onChange={(z) => set({ config: { ...c, zones: z, key: Object.fromEntries(Object.entries(c.key).filter(([k]) => z.some((x) => x.id === k))) } })} /> : <p className="sub">Upload the picture first, then draw the label areas on it.</p>}
      <h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Names members will drag</h3>
      <p className="sub" style={{ margin: 0 }}>Add a name for each area, and any extra wrong names (decoys).</p>
      <div className="qe-grid">
        {labels.map((l, i) => <div className="qe-row" key={l.id}><input type="text" aria-label={`Name ${i + 1}`} maxLength={300} disabled={disabled} value={l.text} onChange={(e) => setLabel(i, e.target.value)} /><button type="button" disabled={disabled} aria-label={`Remove name ${i + 1}`} onClick={() => set({ config: { ...c, labels: labels.filter((_, j) => j !== i), key: Object.fromEntries(Object.entries(c.key).filter(([, v]) => v !== l.id)) } })}>✕</button></div>)}
        <div><button type="button" disabled={disabled || labels.length >= 20} onClick={() => set({ config: { ...c, labels: [...labels, { id: uid(), text: "" }] } })}>+ Add name</button></div>
      </div>
      {zones.length > 0 && <><h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Correct answers</h3>
        {zones.map((z, i) => <label key={z.id}>Area {i + 1}<select disabled={disabled} value={c.key[z.id] ?? ""} onChange={(e) => { const key = { ...c.key }; if (e.target.value) key[z.id] = e.target.value; else delete key[z.id]; set({ config: { ...c, key } }); }}><option value="">(choose)</option>{labels.map((l) => <option key={l.id} value={l.id}>{l.text || "(empty name)"}</option>)}</select></label>)}</>}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto", margin: 0 }} disabled={disabled} checked={c.reuse} onChange={(e) => set({ config: { ...c, reuse: e.target.checked } })} />A name can be used for more than one area</label>
    </div>
  );
}

function Match({ q, set, disabled }: P) {
  const c = q.config, pairs = c.left.map((l: any) => ({ l: l.text, r: c.right.find((r: any) => r.id === c.key[l.id])?.text ?? "" })), decoys = c.right.filter((r: any) => !Object.values(c.key).includes(r.id)).map((r: any) => r.text);
  const build = (pp: { l: string; r: string }[], dd: string[]) => set({ config: { left: pp.map((p, i) => ({ id: "l" + i, text: p.l })), right: [...pp.map((p, i) => ({ id: "r" + i, text: p.r })), ...dd.map((t, i) => ({ id: "d" + i, text: t }))], key: Object.fromEntries(pp.map((_, i) => ["l" + i, "r" + i])) } });
  return (
    <div className="qe-grid">
      <p className="sub" style={{ margin: 0 }}>Each row is a pair. Members see the left side and choose its match from all the right sides (shuffled).</p>
      {pairs.map((p: any, i: number) => <div className="qe-row" key={i}><input type="text" aria-label={`Item ${i + 1}`} maxLength={300} disabled={disabled} value={p.l} onChange={(e) => build(pairs.map((x: any, j: number) => (j === i ? { ...x, l: e.target.value } : x)), decoys)} /><span aria-hidden>=</span><input type="text" aria-label={`Match ${i + 1}`} maxLength={300} disabled={disabled} value={p.r} onChange={(e) => build(pairs.map((x: any, j: number) => (j === i ? { ...x, r: e.target.value } : x)), decoys)} /><button type="button" disabled={disabled} aria-label={`Remove pair ${i + 1}`} onClick={() => build(pairs.filter((_: any, j: number) => j !== i), decoys)}>✕</button></div>)}
      <div><button type="button" disabled={disabled || pairs.length >= 12} onClick={() => build([...pairs, { l: "", r: "" }], decoys)}>+ Add pair</button></div>
      <h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Extra wrong answers (optional)</h3>
      <Strings items={decoys} add="Wrong answer" disabled={disabled} onChange={(d) => build(pairs, d)} />
    </div>
  );
}

function Order({ q, set, disabled }: P) {
  const c = q.config, items: any[] = c.items, put = (a: any[]) => set({ config: { items: a } }), move = (i: number, d: number) => { const a = items.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; put(a); };
  return (
    <div className="qe-grid">
      <p className="sub" style={{ margin: 0 }}>Write the steps in the correct order. Members get them shuffled.</p>
      {items.map((it, i) => <div className="qe-row" key={it.id}><b>{i + 1}.</b><input type="text" aria-label={`Step ${i + 1}`} maxLength={300} disabled={disabled} value={it.text} onChange={(e) => put(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /><button type="button" disabled={disabled || i === 0} aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button type="button" disabled={disabled || i === items.length - 1} aria-label="Move down" onClick={() => move(i, 1)}>↓</button><button type="button" disabled={disabled} aria-label={`Remove step ${i + 1}`} onClick={() => put(items.filter((_, j) => j !== i))}>✕</button></div>)}
      <div><button type="button" disabled={disabled || items.length >= 12} onClick={() => put([...items, { id: uid(), text: "" }])}>+ Add step</button></div>
    </div>
  );
}

function Fill({ q, set, disabled }: P) {
  const c = q.config, n = Math.max(0, ...[...String(c.text).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Math.min(+m[1], 10)));
  const slots: any[] = Array.from({ length: n }, (_, i) => c.slots[i] ?? { choices: ["", ""], correct: -1 });
  const setSlot = (i: number, s: any) => set({ config: { ...c, slots: slots.map((x, j) => (j === i ? s : x)) } });
  return (
    <div className="qe-grid">
      <label>Text with blanks. Write {"{{1}}"}, {"{{2}}"}… where the blanks go.<textarea rows={3} maxLength={2000} disabled={disabled} value={c.text} onChange={(e) => { const t = e.target.value, k = Math.max(0, ...[...t.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Math.min(+m[1], 10))); set({ config: { ...c, text: t, slots: Array.from({ length: k }, (_, i) => c.slots[i] ?? { choices: ["", ""], correct: -1 }) } }); }} /></label>
      {slots.map((s, i) => <fieldset key={i} className="card" style={{ padding: 12 }}><legend>Blank {i + 1}: choices</legend>
        <Strings items={s.choices} add="Choice" disabled={disabled} onChange={(ch) => setSlot(i, { choices: ch, correct: s.correct >= ch.length ? -1 : s.correct })} mark={(k) => <input type="radio" name={`b${i}`} aria-label={`Choice ${k + 1} of blank ${i + 1} is correct`} disabled={disabled} checked={s.correct === k} onChange={() => setSlot(i, { ...s, correct: k })} />} />
      </fieldset>)}
    </div>
  );
}

function Short({ q, set, disabled }: P) {
  const c = q.config;
  return (
    <div className="qe-grid">
      <label>Accepted answers, one per line (capitals and extra spaces don't matter)<textarea rows={3} disabled={disabled} value={c.accepted.join("\n")} onChange={(e) => set({ config: { ...c, accepted: e.target.value.split("\n") } })} /></label>
      <details><summary>Advanced: accept a pattern</summary><label>Pattern (regular expression, optional)<input type="text" maxLength={120} disabled={disabled} value={c.regex} onChange={(e) => set({ config: { ...c, regex: e.target.value } })} /></label></details>
    </div>
  );
}

function Numeric({ q, set, disabled }: P) {
  const c = q.config, f = (k: string, label: string, w = 140) => <label>{label}<input type="number" step="any" disabled={disabled} style={{ width: w }} value={c[k]} onChange={(e) => set({ config: { ...c, [k]: +e.target.value } })} /></label>;
  return <div className="qe-row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>{f("value", "Correct number")}{f("tolerance", "Allowed difference (±)")}<label>Unit shown (optional)<input type="text" maxLength={20} disabled={disabled} style={{ width: 120 }} value={c.unit} onChange={(e) => set({ config: { ...c, unit: e.target.value } })} /></label></div>;
}

function Hot({ q, set, disabled }: P) {
  const c = q.config;
  return (
    <div className="qe-grid">
      <ImageField url={c.image} disabled={disabled} onUploaded={(image) => set({ config: { ...c, image } })} />
      <label>Describe the picture for people who can't see it<input type="text" maxLength={300} disabled={disabled} value={c.alt} onChange={(e) => set({ config: { ...c, alt: e.target.value } })} /></label>
      {c.image ? <><p className="sub" style={{ margin: 0 }}>Draw the area(s) that count as correct.</p><Regions image={c.image} alt={c.alt} regions={c.regions} disabled={disabled} onChange={(regions) => set({ config: { ...c, regions } })} /></> : <p className="sub">Upload the picture first.</p>}
    </div>
  );
}

const BODY: Record<QType, (p: P) => React.ReactNode> = {
  mc_single: Choices, mc_multi: Choices, image_label: Diagram, match: Match, order: Order, fill_blank: Fill, short_text: Short, numeric: Numeric, hotspot: Hot,
  true_false: ({ q, set, disabled }) => <fieldset className="qe-grid" disabled={disabled} style={{ border: 0, padding: 0 }}>{[true, false].map((b) => <label key={String(b)} style={{ display: "flex", gap: 8, margin: 0 }}><input type="radio" style={{ width: "auto", margin: 0 }} name="tf" checked={q.config.correct === b} onChange={() => set({ config: { correct: b } })} />The answer is {b ? "True" : "False"}</label>)}</fieldset>,
};

/** The editor for one question: wording, the type's own answer form, points, critical flag, feedback. */
export default function QuestionForm({ q, set, disabled }: P) {
  const Body = BODY[q.type];
  return (
    <div className="qe-grid">
      <div className="sub" style={{ margin: 0 }}>{TYPE_LABEL[q.type]}</div>
      <label>Question<textarea rows={3} maxLength={5000} disabled={disabled} value={q.prompt_html} onChange={(e) => set({ prompt_html: e.target.value })} /></label>
      <Body q={q} set={set} disabled={disabled} />
      <div className="qe-row" style={{ flexWrap: "wrap" }}>
        <label style={{ margin: 0 }}>Points<input type="number" min={0.25} max={100} step={0.25} disabled={disabled} style={{ width: 90 }} value={q.points} onChange={(e) => set({ points: +e.target.value })} /></label>
        <label style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto", margin: 0 }} disabled={disabled} checked={q.required_correct} onChange={(e) => set({ required_correct: e.target.checked })} />Critical: must be fully right to pass, whatever the total</label>
      </div>
      <label>Explanation shown after the test (optional)<textarea rows={2} maxLength={2000} disabled={disabled} value={q.feedback_html} onChange={(e) => set({ feedback_html: e.target.value })} /></label>
    </div>
  );
}
