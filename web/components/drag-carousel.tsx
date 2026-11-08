"use client";
import { useEffect, useRef, useState } from "react";

// Photo strip: drag with the mouse, swipe on touch, or use the arrow buttons.
export function DragCarousel({ items }: { items: { src: string; alt: string; caption: string }[] }) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef({ down: false, x: 0, left: 0, moved: false });
  const [open, setOpen] = useState<number | null>(null);
  const step = (d: number) => setOpen((i) => (i === null ? i : (i + d + items.length) % items.length));
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const by = (dir: number) => el.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  const stop = () => { st.current.down = false; el.current?.classList.remove("on"); };
  return (
    <div className="dcar">
      <style>{CSS}</style>
      <button type="button" className="dcar-btn l" aria-label="Previous photos" onClick={() => by(-1)}>‹</button>
      <div ref={el} className="dcar-strip" tabIndex={0} role="group" aria-label="Project photos. Drag, swipe or use the arrows to see more."
        onMouseDown={(e) => { st.current = { down: true, x: e.pageX, left: el.current!.scrollLeft, moved: false }; el.current!.classList.add("on"); }}
        onMouseMove={(e) => { const s = st.current; if (!s.down) return; if (Math.abs(e.pageX - s.x) > 5) s.moved = true; el.current!.scrollLeft = s.left - (e.pageX - s.x) * 1.5; }}
        onMouseUp={stop} onMouseLeave={stop}
        onKeyDown={(e) => { if (e.key === "ArrowRight") by(1); if (e.key === "ArrowLeft") by(-1); }}>
        {items.map((it, i) => (
          <figure className="dcar-item" key={i} onClick={() => { if (!st.current.moved) setOpen(i); }}><img loading="lazy" draggable={false} src={it.src} alt={it.alt} />{it.caption && <figcaption>{it.caption}</figcaption>}</figure>
        ))}
      </div>
      <button type="button" className="dcar-btn r" aria-label="Next photos" onClick={() => by(1)}>›</button>
      <p className="dcar-hint">← Drag, swipe or use the arrows to see more · Click a photo to enlarge →</p>
      {open !== null && (
        <div className="dcar-box" role="dialog" aria-modal="true" aria-label={items[open].caption || "Photo"} onClick={() => setOpen(null)}>
          <button type="button" className="dcar-x" aria-label="Close" autoFocus onClick={() => setOpen(null)}>✕</button>
          {items.length > 1 && <button type="button" className="dcar-n l" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); step(-1); }}>‹</button>}
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={items[open].src} alt={items[open].alt} />
            {items[open].caption && <figcaption>{items[open].caption}</figcaption>}
          </figure>
          {items.length > 1 && <button type="button" className="dcar-n r" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); step(1); }}>›</button>}
        </div>
      )}
    </div>
  );
}

const CSS = `
.dcar{position:relative;padding:0 8px}
.dcar-item{cursor:zoom-in}
.dcar-strip{display:flex;gap:16px;overflow-x:auto;padding:8px 4px 16px;scrollbar-width:none;cursor:grab;scroll-snap-type:x proximity}
.dcar-strip::-webkit-scrollbar{display:none}.dcar-strip.on{cursor:grabbing;scroll-snap-type:none}
.dcar-item{flex:0 0 auto;width:300px;margin:0;scroll-snap-align:start;user-select:none}
.dcar-item img{width:100%;height:225px;object-fit:cover;border-radius:8px;display:block;transition:transform .3s}
.dcar-item:hover img{transform:scale(1.03)}.dcar-item figcaption{margin-top:8px;font-weight:600;text-align:center}
.dcar-btn{position:absolute;top:100px;z-index:2;width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;font-size:28px;line-height:1;cursor:pointer}
.dcar-btn.l{left:0}.dcar-btn.r{right:0}.dcar-btn:hover{background:#000}
.dcar-hint{text-align:center;color:#888;font-size:14px;margin:0}
.dcar-box{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:56px 64px}
.dcar-box figure{margin:0;max-width:100%;max-height:100%;text-align:center;color:#fff}
.dcar-box img{max-width:100%;max-height:calc(100vh - 150px);border-radius:6px;display:block;margin:0 auto}.dcar-box figcaption{margin-top:10px;font-weight:600}
.dcar-x{position:absolute;top:12px;right:16px;width:44px;height:44px;border-radius:50%;border:0;background:#fff;color:#000;font-size:22px;cursor:pointer}
.dcar-n{position:absolute;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:28px;cursor:pointer}.dcar-n.l{left:12px}.dcar-n.r{right:12px}
@media(max-width:600px){.dcar-box{padding:56px 8px}}
@media(max-width:600px){.dcar-item{width:240px}.dcar-item img{height:180px}.dcar-btn{top:70px}}
`;
