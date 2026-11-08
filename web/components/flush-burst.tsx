// Full-screen "cache cleared" effect: one burst of colored squares from the centre that drift off-screen for good,
// with CACHE CLEAR flashing 3 times in the first second. Imperative like components/dialog.tsx; click or Esc closes it early.
export function flushBurst(): Promise<void> {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "presentation");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:#000;cursor:pointer";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const w = (canvas.width = innerWidth), h = (canvas.height = innerHeight), cx = w / 2, cy = h / 2;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    let pts = Array.from({ length: 1000 }, () => ({ x: cx, y: cy, vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1 }));
    const t0 = performance.now();
    let raf = 0, closed = false;
    const close = () => {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf); removeEventListener("keydown", key); canvas.remove(); resolve();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", key); canvas.onclick = close;
    const frame = (now: number) => {
      const t = now - t0;
      ctx.fillStyle = "rgba(10,10,10,.1)"; ctx.fillRect(0, 0, w, h); // fade for trails
      pts = pts.filter((p) => { p.x += p.vx; p.y += p.vy; return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h; }); // gone once off-screen
      pts.forEach((p, i) => { ctx.fillStyle = `hsl(${(i * 0.1 + now * 0.001) % 360},100%,50%)`; ctx.fillRect(p.x, p.y, 2, 2); });
      // three flashes inside the first second: on for ~150ms at 0, 330 and 660ms
      if (t < 1000 && [0, 330, 660].some((s) => t >= s && t < s + 150)) {
        ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.min(w / 6, 180)}px system-ui,sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("CACHE CLEAR", cx, cy);
      }
      if ((!pts.length && t > 1000) || t > 15000) { canvas.style.transition = "opacity .4s"; canvas.style.opacity = "0"; setTimeout(close, 400); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}
