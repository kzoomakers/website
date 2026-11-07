"use client";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ImageInput } from "@/components/image-field";
import { useRouter } from "next/navigation";
import { rpc, type Camp, type State } from "./api";
import { FONTS, LEAF_TYPES, blank, cleanHtml, fill, renderBlock, renderEmail, type Block, type Design } from "@/lib/mail-render";

type Drag = { kind: "new"; make: () => Block } | { kind: "move"; list: string; index: number };
type Over = { list: string; at: number } | null;
type Ctx = { d: Design; base: string; sel: string | null; select: (p: string | null) => void; drag: React.MutableRefObject<Drag | null>; over: Over; setOver: (o: Over) => void; locked: boolean };
const C = createContext<Ctx>(null as any);

const ins = <T,>(a: T[], at: number, x: T) => [...a.slice(0, at), x, ...a.slice(at)];
const mv = <T,>(a: T[], from: number, to: number) => { const n = [...a]; n.splice(to, 0, n.splice(from, 1)[0]); return n; };
const TILES: Record<string, [string, string]> = { heading: ["Title", "T"], text: ["Text", "¶"], image: ["Image", "🖼"], button: ["Button", "▭"], divider: ["Divider", "―"], spacer: ["Spacer", "↕"], social: ["Social", "@"], footer: ["Footer", "⚓"] };

const CSS = `.me-item{position:relative;outline:1px dashed transparent;margin:2px 0;cursor:pointer}.me-item:hover{outline-color:#8aa}.me-item[data-sel]{outline:2px solid #2f6fed}
.me-tools{display:none;position:absolute;top:-30px;right:0;background:#2f6fed;color:#fff;border-radius:6px 6px 0 0;padding:2px 4px;gap:2px;align-items:center;z-index:5;font:14px system-ui;white-space:nowrap}
.me-item:hover>.me-tools,.me-item[data-sel]>.me-tools{display:flex}.me-item:has(.me-item:hover)>.me-tools:not(.me-sel){display:none}
.me-tools button,.me-tools span{background:none;border:0;color:#fff;cursor:pointer;padding:2px 6px;font:inherit}.me-tools button:disabled{opacity:.4}
.me-tile{border:1px solid var(--line);border-radius:8px;padding:10px 4px;text-align:center;cursor:grab;background:var(--card);user-select:none}.me-tile:hover{border-color:var(--acc)}
.me-col{border:1px dashed #bbb;min-height:40px;padding:2px}`;

export default function Editor({ id, state }: { id: number; state: State }) {
  const router = useRouter();
  const [c, setC] = useState<Camp | undefined>();
  const [msg, setMsg] = useState("");
  const [sel, select] = useState<string | null>(null);
  const [over, setOver] = useState<Over>(null);
  const [tab, setTab] = useState<"content" | "layout" | "styles" | "ai" | "details">("content");
  const [mobile, setMobile] = useState(false);
  const [ai, setAi] = useState({ prompt: "", revise: false, busy: false });
  const drag = useRef<Drag | null>(null);
  useEffect(() => { rpc("campaign", { id }).then(setC).catch((e) => setMsg(e.message)); }, [id]);

  if (!c) return <p>{msg || "Loading…"}</p>;

  const d = c.design, locked = c.status !== undefined && c.status !== "draft";
  const setD = (p: Partial<Design>) => setC({ ...c, design: { ...d, ...p } });
  const run = async (label: string, fn: () => Promise<unknown>) => { setMsg(label + "…"); try { await fn(); } catch (e: any) { setMsg(e.message); } };
  const save = async () => { await rpc("saveCampaign", { campaign: c }); };
  const append = (b: Block) => { setD({ blocks: [...d.blocks, b] }); select(String(d.blocks.length)); };
  const ctx: Ctx = { d, base: location.origin, sel, select, drag, over, setOver, locked };

  const tile = (key: string, label: string, icon: string, make: () => Block) => (
    <div key={key} className="me-tile" draggable={!locked} onClick={() => !locked && append(make())}
      onDragStart={(e) => { drag.current = { kind: "new", make }; e.dataTransfer.setData("text/plain", key); e.dataTransfer.effectAllowed = "copy"; }}
      onDragEnd={() => { drag.current = null; setOver(null); }}><div style={{ fontSize: 22 }}>{icon}</div><small>{label}</small></div>
  );
  const colorIn = (k: "bg" | "contentBg" | "text" | "heading" | "accent", label: string) => <p><label>{label} <input type="color" value={d[k]} onChange={(e) => setD({ [k]: e.target.value })} /></label></p>;

  return (
    <C.Provider value={ctx}>
      <style>{CSS}</style>
      <div className="bar">
        <button onClick={() => router.push("/admin/mail/emails")}>← Emails</button>
        <input aria-label="Internal name" style={{ fontWeight: 600, minWidth: 220 }} value={c.name} disabled={locked} onChange={(e) => setC({ ...c, name: e.target.value })} />
        {!locked && <>
          <button onClick={() => run("Saving", async () => { await save(); setMsg("Saved."); })}>Save</button>
          <button className="pri" onClick={() => run("Saving", async () => { await save(); router.push(`/admin/mail/email/${id}/send`); })}>Next →</button></>}
        <button onClick={() => setMobile(!mobile)}>{mobile ? "🖥 Desktop" : "📱 Mobile"} view</button>
        {msg && <span className="sub" style={{ margin: 0 }} role="status">{msg}</span>}
      </div>
      {locked && <p className="sub">This email has already been sent, so it's read-only.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ background: d.bg, padding: "20px 10px", borderRadius: 8, minHeight: "60vh" }} onClick={() => select(null)}>
            <div style={{ width: mobile ? 375 : "100%", maxWidth: 600, margin: "0 auto", background: d.contentBg, padding: 24, boxSizing: "content-box", fontFamily: FONTS[d.font] }} onClick={(e) => e.stopPropagation()}>
              <BlockList list={d.blocks} onChange={(blocks) => setD({ blocks })} prefix="" nested={false} />
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 10, position: "sticky", top: 12 }}>
          <div className="bar" style={{ flexWrap: "wrap" }}>{(["content", "layout", "styles", "ai", "details"] as const).map((t) => <button key={t} className={tab === t ? "pri" : ""} onClick={() => setTab(t)}>{t === "ai" ? "✨ AI" : t[0].toUpperCase() + t.slice(1)}</button>)}</div>
          {tab === "content" && <><p className="sub">Drag onto the email, or click to add at the end.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>{LEAF_TYPES.map((t) => tile(t, TILES[t][0], TILES[t][1], () => blank(t)))}</div></>}
          {tab === "layout" && <><p className="sub">Columns hold other blocks. Drag blocks into each column.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>{[1, 2, 3].map((n) => tile("cols" + n, n + (n === 1 ? " column" : " columns"), "▥".repeat(n), () => blank("columns", n)))}</div></>}
          {tab === "styles" && <>
            {colorIn("bg", "Background")}{colorIn("contentBg", "Email background")}{colorIn("text", "Text colour")}{colorIn("heading", "Title colour")}{colorIn("accent", "Links & buttons")}
            <p><label>Font <select value={d.font} onChange={(e) => setD({ font: e.target.value })}>{Object.keys(FONTS).map((f) => <option key={f}>{f}</option>)}</select></label></p>
            <p><label>Text size <input type="number" min={12} max={22} style={{ width: 60 }} value={d.size} onChange={(e) => setD({ size: +e.target.value })} /></label></p></>}
          {tab === "ai" && (!state.cfg.ai ? <p className="sub">Add a DeepSeek API token in the Settings tab to turn this on.</p> : <>
            <textarea style={{ width: "100%" }} rows={5} aria-label="What should the email say?" placeholder="e.g. Announce our spring open house on May 4th, mention free pizza and laser demos" value={ai.prompt} onChange={(e) => setAi({ ...ai, prompt: e.target.value })} />
            <p><label><input type="checkbox" checked={ai.revise} onChange={(e) => setAi({ ...ai, revise: e.target.checked })} /> Revise the current email instead of starting over</label></p>
            <button className="pri" disabled={ai.busy || !ai.prompt.trim() || locked} onClick={async () => {
              setAi({ ...ai, busy: true }); setMsg("");
              try {
                const r = await rpc("ai", { prompt: ai.prompt, current: ai.revise ? { subject: c.subject, preview: c.preview, design: d } : undefined });
                setC({ ...c, subject: r.subject || c.subject, preview: r.preview || c.preview, design: r.design }); select(null);
              } catch (e: any) { setMsg(e.message); }
              setAi((a) => ({ ...a, busy: false }));
            }}>{ai.busy ? "Writing…" : "Generate"}</button></>)}
          {tab === "details" && <>
            <p className="sub">Subject, recipients and sender come on the next step. Use <code>{"{{name}}"}</code> in the text to greet each person.</p>
            <button onClick={() => run("Saving template", async () => { const name = prompt("Template name?"); if (!name) return setMsg(""); await rpc("saveTemplate", { name, design: d }); setMsg("Template saved."); })}>Save as template</button></>}
        </div>
      </div>
    </C.Provider>
  );
}

function BlockList({ list, onChange, prefix, nested }: { list: Block[]; onChange: (l: Block[]) => void; prefix: string; nested: boolean }) {
  const x = useContext(C);
  const drop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const g = x.drag.current, at = x.over?.list === prefix ? x.over.at : list.length;
    x.drag.current = null; x.setOver(null);
    if (!g) return;
    if (g.kind === "new") { const b = g.make(); if (nested && b.t === "columns") return; onChange(ins(list, at, b)); x.select(prefix + at); }
    else if (g.list === prefix) { const to = at > g.index ? at - 1 : at; onChange(mv(list, g.index, to)); x.select(prefix + to); }
  };
  return (
    <div className={nested ? "me-col" : undefined} style={{ minHeight: nested ? 40 : 80 }} onDrop={drop}
      onDragOver={(e) => { if (!x.drag.current) return; e.preventDefault(); e.stopPropagation(); if (!list.length) x.setOver({ list: prefix, at: 0 }); }}>
      {!list.length && <div style={{ textAlign: "center", color: "#999", padding: 16, font: "14px system-ui" }}>{nested ? "Drop blocks here" : "Drag blocks here from the right"}</div>}
      {list.map((b, i) => <Item key={i} b={b} i={i} list={list} onChange={onChange} prefix={prefix} />)}
    </div>
  );
}

function Item({ b, i, list, onChange, prefix }: { b: Block; i: number; list: Block[]; onChange: (l: Block[]) => void; prefix: string }) {
  const x = useContext(C);
  const path = prefix + i, selected = x.sel === path;
  const set = (nb: Block) => onChange(list.map((y, j) => (j === i ? nb : y)));
  const go = (to: number) => { onChange(mv(list, i, to)); x.select(prefix + to); };
  const html = b.t === "columns" ? "" : renderBlock(b, x.d, x.base);
  const o = x.over?.list === prefix ? x.over.at : -1;
  const fmt = (cmd: string, arg?: string) => document.execCommand(cmd, false, arg);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // toolbar clicks must not steal the text selection
  const rich = selected && b.t === "text";
  return (
    <div className="me-item" data-sel={selected || undefined}
      style={{ boxShadow: o === i ? "0 -3px 0 #2f6fed" : o === i + 1 && i === list.length - 1 ? "0 3px 0 #2f6fed" : undefined }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); x.select(path); }}
      onDragOver={(e) => { if (!x.drag.current) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); x.setOver({ list: prefix, at: e.clientY < r.top + r.height / 2 ? i : i + 1 }); }}>
      {!x.locked && (
        <div className={"me-tools" + (selected ? " me-sel" : "")} onMouseDown={keep}>
          <span draggable title="Drag to move" style={{ cursor: "grab" }}
            onDragStart={(e) => { e.stopPropagation(); x.drag.current = { kind: "move", list: prefix, index: i }; e.dataTransfer.setData("text/plain", "b"); e.dataTransfer.effectAllowed = "move"; const el = e.currentTarget.closest(".me-item"); if (el) e.dataTransfer.setDragImage(el, 0, 0); }}
            onDragEnd={() => { x.drag.current = null; x.setOver(null); }}>⠿</span>
          {rich && <>
            <button title="Bold" onClick={() => fmt("bold")}><b>B</b></button><button title="Italic" onClick={() => fmt("italic")}><i>I</i></button><button title="Underline" onClick={() => fmt("underline")}><u>U</u></button>
            <button title="Link" onClick={() => { const u = prompt("Link address (https://…)"); if (u) fmt("createLink", u); }}>🔗</button><button title="Remove link" onClick={() => fmt("unlink")}>⛓‍💥</button>
            <button title="Bullets" onClick={() => fmt("insertUnorderedList")}>•≡</button><button title="Numbers" onClick={() => fmt("insertOrderedList")}>1≡</button></>}
          {(b.t === "text" || b.t === "heading") && (["left", "center", "right"] as const).map((a) => <button key={a} title={"Align " + a} onClick={() => set({ ...b, align: a })}>{a === "left" ? "⇤" : a === "center" ? "↔" : "⇥"}</button>)}
          <button title="Move up" disabled={i === 0} onClick={() => go(i - 1)}>↑</button>
          <button title="Move down" disabled={i === list.length - 1} onClick={() => go(i + 1)}>↓</button>
          <button title="Duplicate" onClick={() => { onChange(ins(list, i + 1, structuredClone(b))); x.select(prefix + (i + 1)); }}>⧉</button>
          <button title="Delete" onClick={() => { onChange(list.filter((_, j) => j !== i)); x.select(null); }}>✕</button>
        </div>)}
      {b.t === "columns" ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
          {b.cols.map((col, ci) => (
            <td key={ci} style={{ verticalAlign: "top", width: 100 / b.cols.length + "%", padding: "0 6px" }}>
              <BlockList list={col} nested prefix={`${path}.${ci}.`} onChange={(nl) => set({ ...b, cols: b.cols.map((y, k) => (k === ci ? (nl as any) : y)) })} />
            </td>))}
        </tr></tbody></table>
      ) : selected && !x.locked && (b.t === "text" || b.t === "heading" || b.t === "button")
        ? <Inline html={html} sel={b.t === "text" ? "div" : b.t === "heading" ? "h1" : "a"} multi={b.t === "text"}
            onCommit={(v) => set(b.t === "text" ? { ...b, html: cleanHtml(v) } : b.t === "heading" ? { ...b, text: v } : { ...b, label: v })} />
        : html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div style={{ border: "2px dashed #bbb", padding: 28, textAlign: "center", color: "#888", font: "14px system-ui" }}>🖼 Click to choose an image</div>}
      {selected && !x.locked && !["text", "heading", "divider"].includes(b.t) && <div style={{ background: "#f4f6fb", border: "1px solid #dde", padding: 8, marginTop: 4, font: "14px system-ui", color: "#222" }} onClick={(e) => e.stopPropagation()}><Form b={b} set={set} /></div>}
    </div>
  );
}

/** Makes one element of the already-rendered block editable in place, so the canvas looks exactly like the sent email. Commits on blur. */
function Inline({ html, sel, multi, onCommit }: { html: string; sel: string; multi: boolean; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null), done = useRef(onCommit), first = useRef(true);
  done.current = onCommit;
  useEffect(() => {
    const el = ref.current?.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    el.contentEditable = "true"; el.style.outline = "none";
    if (first.current) {
      first.current = false; el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
      document.execCommand("defaultParagraphSeparator", false, "p");
    }
    const commit = () => done.current(multi ? el.innerHTML : el.innerText.replace(/\n/g, " "));
    const key = (e: KeyboardEvent) => { if (!multi && e.key === "Enter") { e.preventDefault(); el.blur(); } };
    el.addEventListener("blur", commit); el.addEventListener("keydown", key);
    return () => { el.removeEventListener("blur", commit); el.removeEventListener("keydown", key); };
  }, [html, sel, multi]);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Form({ b, set }: { b: Block; set: (b: Block) => void }) {
  const inp = (k: string, ph: string) => <input style={{ width: "100%", marginTop: 4 }} aria-label={ph} placeholder={ph} value={(b as any)[k] ?? ""} onChange={(e) => set({ ...b, [k]: e.target.value } as Block)} />;
  switch (b.t) {
    case "image": return <div><ImageInput value={b.src} onChange={(v) => set({ ...b, src: v })} />{inp("alt", "Description (alt text)")}{inp("href", "Link when clicked (optional)")}</div>;
    case "button": return <div>{inp("href", "Link address")}<label>Button colour <input type="color" value={b.color || "#2f6fed"} onChange={(e) => set({ ...b, color: e.target.value })} /></label></div>;
    case "spacer": return <label>Height <input type="range" min={4} max={120} value={b.h} onChange={(e) => set({ ...b, h: +e.target.value })} /> {b.h}px</label>;
    case "footer": return inp("text", "Footer text (an unsubscribe link is added automatically)");
    case "social": return <div>{b.links.map((l, i) => (
      <div key={i}><input aria-label="Label" style={{ width: "30%" }} value={l.label} onChange={(e) => set({ ...b, links: b.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />{" "}
        <input aria-label="Link" style={{ width: "55%" }} value={l.href} onChange={(e) => set({ ...b, links: b.links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)) })} />{" "}
        <button onClick={() => set({ ...b, links: b.links.filter((_, j) => j !== i) })}>✕</button></div>))}
      <button onClick={() => set({ ...b, links: [...b.links, { label: "Link", href: "https://" }] })}>＋ link</button></div>;
    case "columns": return <label>Columns {[1, 2, 3].map((n) => <button key={n} className={n === b.cols.length ? "pri" : ""} onClick={() => set({ ...b, cols: n >= b.cols.length ? [...b.cols, ...Array.from({ length: n - b.cols.length }, () => [])] : [...b.cols.slice(0, n - 1), b.cols.slice(n - 1).flat()] })}>{n}</button>)}</label>;
    default: return null;
  }
}
