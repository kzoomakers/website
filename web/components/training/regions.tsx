"use client";
import { useRef, useState } from "react";
import "./training.css";

export type Region = { id?: string; x: number; y: number; w: number; h: number };
const r1 = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

// Author tool: draw rectangles on a picture (drag), pick one to adjust, or type its numbers (the keyboard route). Positions are percentages of the picture, so they scale.
export default function Regions({ image, alt, regions, onChange, newId, disabled }: { image: string; alt: string; regions: Region[]; onChange: (r: Region[]) => void; newId?: () => string; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null), [sel, setSel] = useState(-1), [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const at = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: r1(((e.clientX - r.left) / r.width) * 100), y: r1(((e.clientY - r.top) / r.height) * 100) }; };
  const set = (i: number, p: Partial<Region>) => onChange(regions.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const d = drag && { x: Math.min(drag.x, drag.x2), y: Math.min(drag.y, drag.y2), w: Math.abs(drag.x2 - drag.x), h: Math.abs(drag.y2 - drag.y) };
  return (
    <div>
      <p className="sub" style={{ margin: "0 0 8px" }}>Drag on the picture to draw an area. Select an area to change its numbers or delete it.</p>
      <div ref={box} className="tq-diagram tq-edit"
        onPointerDown={(e) => { if (disabled || (e.target as HTMLElement).closest(".tq-rg")) return; e.currentTarget.setPointerCapture(e.pointerId); const p = at(e); setDrag({ x: p.x, y: p.y, x2: p.x, y2: p.y }); }}
        onPointerMove={(e) => { if (drag) { const p = at(e); setDrag({ ...drag, x2: p.x, y2: p.y }); } }}
        onPointerUp={() => { if (d && d.w >= 1 && d.h >= 1) { onChange([...regions, { ...(newId ? { id: newId() } : {}), x: r1(d.x), y: r1(d.y), w: r1(d.w), h: r1(d.h) }]); setSel(regions.length); } setDrag(null); }}>
        <img src={image} alt={alt || "Diagram being edited"} draggable={false} />
        {regions.map((r, i) => <button key={i} type="button" className="tq-rg" data-sel={sel === i ? "" : undefined} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, padding: 0 }} aria-label={`Area ${i + 1}`} onClick={() => setSel(i)}><span className="n" style={{ position: "absolute", top: 0, left: 0, background: "var(--acc)", color: "#fff", fontSize: 11, padding: "0 4px" }}>{i + 1}</span></button>)}
        {d && <span className="tq-rg" style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` }} />}
      </div>
      {sel >= 0 && regions[sel] && (
        <div className="qe-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <b>Area {sel + 1}</b>
          {(["x", "y", "w", "h"] as const).map((k) => <label key={k} style={{ margin: 0, display: "flex", gap: 4, alignItems: "center" }}>{({ x: "Left", y: "Top", w: "Width", h: "Height" })[k]} %<input type="number" min={0} max={100} step={0.5} disabled={disabled} value={regions[sel][k]} onChange={(e) => set(sel, { [k]: r1(+e.target.value) })} style={{ width: 80, display: "inline-block", margin: 0 }} /></label>)}
          <button type="button" className="danger" disabled={disabled} onClick={() => { onChange(regions.filter((_, j) => j !== sel)); setSel(-1); }}>Delete area</button>
        </div>
      )}
    </div>
  );
}
