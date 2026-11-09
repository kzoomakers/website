"use client";
import { useDirtyGuard } from "@/components/dirty-guard";
import Flash from "@/components/flash";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { ImageInput, uploadImage } from "@/components/image-field";
import { uploadBatch } from "@/lib/upload-client";
import NeedsEditor from "./needs";
import Revisions from "../../revisions";
import { guidedLines, type Field, type GuidedDef } from "@/lib/guided";

type Obj = Record<string, any>;

// A yes/no toggle may start on its first option; any other select starts empty so the editor has to choose.
const yesNo = (f: Field) => f.options!.join() === "no,yes";
const blank = (fields: Field[]): Obj => Object.fromEntries(fields.map((f) => [f.key, f.kind === "list" || f.kind === "needs" ? [] : f.kind === "select" && yesNo(f) ? f.options![0].split("|")[0] : ""]));

/** Label of the first shown select left empty (new items only; saved content always has a value), or "". */
const unchosen = (fields: Field[], v: Obj, up: Obj = {}): string => {
  const here = { ...up, ...v };
  for (const f of fields) {
    if (f.when && !f.when[1].includes(here[f.when[0]])) continue;
    if (f.kind === "select" && !v[f.key]) return f.label;
    if (f.kind === "list") for (const it of v[f.key] ?? []) { const m = unchosen(f.of!, it, here); if (m) return m; }
  }
  return "";
};

const opt = (o: string) => o.split("|") as [string, string?];

// Plain form control for one field; lists recurse into their own items. `up` = the enclosing record (for "when" and nested lists).
function Control({ f, v, set, up }: { f: Field; v: any; set: (v: any) => void; up: Obj }) {
  if (f.kind === "needs") return <NeedsEditor items={v} set={set} />;
  if (f.kind === "list" && f.thumb) return <PhotoGrid f={f} list={v} set={set} />;
  if (f.kind === "list") return <ListEditor f={f} list={v} set={set} up={up} />;
  if (f.kind === "select" && f.pick)
    return (
      <div className="gfield"><span>{f.label}{f.hint && <em> — {f.hint}</em>}</span>
        <div className="gpick" role="radiogroup" aria-label={f.label}>
          {f.options!.map((o) => <button type="button" key={o} role="radio" aria-checked={v === opt(o)[0]} className={v === opt(o)[0] ? "on" : ""} onClick={() => set(opt(o)[0])}>{opt(o)[1] ?? o}</button>)}
        </div>
      </div>
    );
  return (
    <label className="gfield">
      <span>{f.label}{f.hint && <em> — {f.hint}</em>}</span>
      {f.kind === "area" || f.kind === "lines" ? <textarea rows={f.kind === "lines" ? 6 : 4} value={v} onChange={(e) => set(e.target.value)} />
        : f.kind === "image" ? <ImageInput value={v} onChange={set} avatar={f.avatar} />
        : f.kind === "select" ? <select value={v} onChange={(e) => set(e.target.value)}>{!v && <option value="">Choose…</option>}{f.options!.map((o) => <option key={o} value={opt(o)[0]}>{opt(o)[1] ?? o}</option>)}</select>
        : f.kind === "color" ? <span><input type="color" value={v || "#008080"} onChange={(e) => set(e.target.value)} /> <input value={v} placeholder="(none)" onChange={(e) => set(e.target.value)} style={{ width: 110 }} /></span>
        : <input value={v} onChange={(e) => set(e.target.value)} />}
    </label>
  );
}

function Fields({ fields, v, set, up = {} }: { fields: Field[]; v: Obj; set: (v: Obj) => void; up?: Obj }) {
  const here = { ...up, ...v };
  return <>{fields.filter((f) => !f.when || f.when[1].includes(here[f.when[0]])).map((f) => (
    <div key={f.key}>
      {f.group && <h3 className="ggroup">{f.group}</h3>}
      <Control f={f} v={v[f.key]} up={here} set={(x) => set({ ...v, [f.key]: x })} />
    </div>
  ))}</>;
}

const src = (u: string) => (/^(https?:|\/)/.test(u) ? u : "/" + u);

// Visual list of photos: thumbnails you can drag to reorder, click to edit/replace, add several at once, and remove.
function PhotoGrid({ f, list, set }: { f: Field; list: Obj[]; set: (l: Obj[]) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const t = f.thumb!;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const l = [...list]; const [x] = l.splice(from, 1); l.splice(to, 0, x); set(l); setSel(to);
  };
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(`Uploading 0 of ${files.length}…`);
    const res = await uploadBatch(Array.from(files), (file) => uploadImage(file), (d, n) => setBusy(`Uploading ${d} of ${n}…`));
    const bad = res.find((r): r is Error => r instanceof Error);
    setBusy(bad ? `Upload failed: ${bad.message}` : "");
    const added: Obj[] = res.filter((r): r is string => typeof r === "string").map((url) => ({ ...blank(f.of!), [t]: url }));
    if (added.length) { set([...list, ...added]); setSel(list.length); }
  };
  const cur = sel !== null ? list[sel] : null;
  return (
    <fieldset className="glist">
      <legend>{f.label} ({list.length})</legend>
      <p className="sub" style={{ margin: "0 0 8px" }}>Drag photos to reorder. Click a photo to change it, describe it, or remove it.</p>
      <div className="pgrid">
        {list.map((it, i) => (
          <button type="button" key={i} className={`ptile${sel === i ? " on" : ""}`} draggable aria-label={`Photo ${i + 1}: ${it[f.item!] || "no description"}`}
            onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
            onClick={() => setSel(sel === i ? null : i)}>
            {it[t] ? <img src={src(it[t])} alt="" /> : <span>No photo</span>}<b>{i + 1}</b>
          </button>
        ))}
        <label className="ptile padd"><span>＋<br />Add photos</span>
          <input type="file" multiple hidden accept="image/*,.heic,.heif" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {busy.startsWith("Upload failed") ? <Flash msg={busy} /> : busy && <p role="status" className="sub">{busy}</p>}
      {cur && sel !== null && (
        <div className="card pedit">
          <Fields fields={f.of!} v={cur} set={(x) => set(list.map((y, j) => (j === sel ? x : y)))} />
          <div className="bar">
            <button disabled={!sel} onClick={() => move(sel, sel - 1)}>← Earlier</button>
            <button disabled={sel === list.length - 1} onClick={() => move(sel, sel + 1)}>Later →</button>
            <button className="danger" onClick={async () => { if (await confirmDialog("Remove this photo from the page?", { ok: "Remove", danger: true })) { set(list.filter((_, j) => j !== sel)); setSel(null); } }}>Remove photo</button>
            <button onClick={() => setSel(null)}>Done</button>
          </div>
        </div>
      )}
    </fieldset>
  );
}

function ListEditor({ f, list, set, up }: { f: Field; list: Obj[]; set: (l: Obj[]) => void; up: Obj }) {
  const move = (i: number, d: number) => { const l = [...list]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); set(l); };
  return (
    <fieldset className="glist">
      <legend>{f.label} ({list.length})</legend>
      {list.map((it, i) => (
        <details key={i} className="card gitem">
          <summary>{it[f.item!] || it[f.of!.find((x) => x.kind === "list")?.key ?? ""]?.[0]?.[f.of!.find((x) => x.kind === "list")?.item ?? ""] || "(untitled)"}</summary>
          <Fields fields={f.of!} v={it} up={up} set={(x) => set(list.map((y, j) => (j === i ? x : y)))} />
          <div className="bar">
            <button disabled={!i} onClick={() => move(i, -1)}>↑ Move up</button>
            <button disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓ Move down</button>
            <button className="danger" onClick={async () => (await confirmDialog(`Remove ${it[f.item!] || "this item"}?`, { ok: "Remove", danger: true })) && set(list.filter((_, j) => j !== i))}>Remove</button>
          </div>
        </details>
      ))}
      <button onClick={() => set([...list, blank(f.of!)])}>+ Add {f.add ?? "another"}</button>
    </fieldset>
  );
}

export default function GuidedEditor({ def, initial }: { def: GuidedDef; initial: Obj }) {
  const [d, setD] = useState(initial);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(0);
  const [base, setBase] = useState(JSON.stringify(initial));
  const dirty = useDirtyGuard(d, base);
  const api = `/api/webmaster/guided/${def.slug}`;
  // Unsaved edits are kept in this browser every 2s so a crash or killed tab doesn't lose a long session (nothing is published).
  const key = `guided-draft:${def.slug}`, [draft, setDraft] = useState<Obj | null>(null);
  const store = (v: string | null) => { try { v === null ? localStorage.removeItem(key) : localStorage.setItem(key, v); } catch {} };
  useEffect(() => { try { const x = JSON.parse(localStorage.getItem(key) ?? "null"); if (x && JSON.stringify(x) !== base) setDraft(x); } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => store(JSON.stringify(d)), 2000); return () => clearTimeout(t); }, [d, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const need = unchosen(def.fields, d);
    if (need) return setMsg(`Choose a value for “${need}” first.`);
    const r = await fetch(api, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
    setMsg(r.ok ? "Saved." : await r.text());
    if (r.ok) { setBase(JSON.stringify(d)); setSaved(saved + 1); store(null); }
  };
  return (
    <>
      <h1>{def.label}</h1>
      <p className="sub">{def.blurb} Shown on <a href={`/${def.slug}`}>/{def.slug}</a>.</p>
      {draft && <div className="card" role="status" style={{ padding: 12 }}>Unsaved edits from an earlier session were found in this browser. <button onClick={() => { setD(draft); setDraft(null); }}>Restore them</button> <button onClick={() => { store(null); setDraft(null); }}>Discard</button></div>}
      <div className="card" style={{ padding: 12 }}><Fields fields={def.fields} v={d} set={(x) => { setMsg(""); setD(x); }} /></div>
      <div className="bar savebar">
        <button className="pri" disabled={!dirty} onClick={save}>Save changes</button>
        <a href={`/${def.slug}`} target="_blank" rel="noreferrer"><button type="button">View page ↗</button></a>
        <span role="status" className={msg && msg !== "Saved." && msg !== "Reverted." ? "err" : dirty ? "tag" : "toast"}>{dirty && !msg ? "You have unsaved changes" : msg}</span>
        {def.slug === "handbook" && saved > 0 && <a href="/admin/webmaster/handbook-updates">Email members about this change →</a>}
      </div>
      <Revisions<Obj> api={api} reload={saved}
        lines={(x) => guidedLines(def.fields, x)}
        onRevert={async (r) => { const x = await r.json(); setD(x); setBase(JSON.stringify(x)); store(null); setMsg("Reverted."); }} />
    </>
  );
}
