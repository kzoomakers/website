"use client";
import { useEffect, useRef, useState } from "react";

const CLIPS = [1, 2, 3].map((n) => `/clips/bulbvideo${n}.mp4`), POWER_ON_MS = 700, BETWEEN_MS = 2000;
// Where the glass is inside public/tv/frame.webp, as a share of the frame (measured from its transparent hole).
const SCREEN = { left: "7.2%", top: "9.37%", width: "66.49%", height: "74.95%" };

const rnd = (min: number, max: number) => Math.floor(Math.random() * (Math.ceil(max) - Math.ceil(min) + 1)) + Math.ceil(min);

/** The tracking-noise speckle of an old VCR: white dots with short tails, redrawn every frame (the codepen's VCREffect, sized to the screen instead of the window). */
function noiseFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#fff";
  let miny = 220, miny2 = 220;
  for (let i = 0; i <= 70; i++) {
    const x = Math.random() * w;
    for (const y of [rnd((miny += 3), Math.max(h, miny)), rnd(0, Math.max(0, (miny2 -= 3)))]) {
      let r = 2, xx = x; ctx.fillRect(xx, y, r, r);
      const dir = Math.random() < 0.5 ? 1 : -1;
      for (let k = 0, n = rnd(1, 50); k < n; k++) { r -= 0.1; if (r <= 0) break; ctx.fillRect((xx += rnd(1, 4) * dir), y, r, r); }
    }
  }
}

// The bulb picture on an old TV. Once the whole set is on screen it switches on (static), plays a muted clip, shows static for 2 seconds, then the next clip (1, 2, 3, 1, ...).
// Off screen it goes back to the still picture and stops drawing. Nothing loads until the first play; with reduced motion it stays a still picture.
export function BulbTv({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"still" | "snow" | "play">("still");
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const b = box.current, v = video.current, c = canvas.current;
    if (!b || !v || !c || matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
    setMotion(true);
    const ctx = c.getContext("2d");
    let visible = false, i = 0, timer: ReturnType<typeof setTimeout> | undefined, raf = 0, busy = false;
    const draw = () => { if (ctx) noiseFrame(ctx, c.width, c.height); raf = requestAnimationFrame(draw); };
    const size = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
    const ro = new ResizeObserver(size); ro.observe(c); size();
    const start = (wait: number) => {
      clearTimeout(timer); busy = true; setPhase("snow");
      timer = setTimeout(() => {
        if (!visible) return;
        v.src = CLIPS[i % CLIPS.length];
        v.play().catch(() => { busy = false; setPhase("still"); }); // autoplay refused: leave the picture
      }, wait);
    };
    const onPlaying = () => setPhase("play");
    const onEnded = () => { i++; v.pause(); start(BETWEEN_MS); };
    v.addEventListener("playing", onPlaying); v.addEventListener("ended", onEnded);
    const io = new IntersectionObserver(([e]) => {
      const now = e.intersectionRatio >= 0.98; // the whole set, allowing for sub-pixel rounding
      if (now === visible) return;
      visible = now;
      if (now) { raf = requestAnimationFrame(draw); if (!busy) start(POWER_ON_MS); }
      else { clearTimeout(timer); cancelAnimationFrame(raf); busy = false; v.pause(); setPhase("still"); }
    }, { threshold: [0, 0.98, 1] });
    io.observe(b);
    return () => { io.disconnect(); ro.disconnect(); clearTimeout(timer); cancelAnimationFrame(raf); v.removeEventListener("playing", onPlaying); v.removeEventListener("ended", onEnded); };
  }, []);
  return (
    <div ref={box} className="bulb_tv" data-motion={motion || undefined} role="img" aria-label="An old television playing animated clips of a light bulb being built">
      <style>{CSS}</style>
      <div className="bulb_tv_screen" style={SCREEN}>
        <img className="bulb_tv_still" src={src} alt="" loading="lazy" />
        <video ref={video} muted playsInline preload="none" aria-hidden="true" tabIndex={-1} style={{ opacity: phase === "play" ? 1 : 0 }} />
        <canvas ref={canvas} />
        <div className="bulb_tv_glitch" />
        <div className="bulb_tv_snow" style={{ opacity: phase === "snow" ? 1 : 0 }} />
        <div className="bulb_tv_lines" />
      </div>
      <img className="bulb_tv_frame" src="/tv/frame.webp" alt="" />
    </div>
  );
}

const CSS = `
.bulb_tv { position: relative; width: 100%; max-width: 640px; aspect-ratio: 1486 / 982; }
.bulb_tv_screen { position: absolute; overflow: hidden; background: #111; }
.bulb_tv_screen > * { position: absolute; inset: 0; width: 100%; height: 100%; }
.bulb_tv_still { object-fit: contain; background: #e6e0d2; filter: contrast(1.1) brightness(1.05); }
.bulb_tv_screen video { object-fit: contain; background: #000; transition: opacity .3s; filter: contrast(1.2) brightness(1.1); }
.bulb_tv_screen canvas { mix-blend-mode: screen; pointer-events: none; }
.bulb_tv_glitch, .bulb_tv_snow { pointer-events: none; background: url(/tv/static.webp) center / cover; }
.bulb_tv_glitch { mix-blend-mode: multiply; opacity: .1; }
.bulb_tv[data-motion] .bulb_tv_glitch { animation: bulb_tv_jitter .2s infinite linear; }
.bulb_tv_snow { transition: opacity .35s ease-in-out; }
.bulb_tv_lines { pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0, rgba(0,0,0,.2) 1px, rgba(0,0,0,0) 2px); }
.bulb_tv_frame { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
@keyframes bulb_tv_jitter { 0% { transform: translateX(0) } 33% { transform: translateX(-5px) } 66% { transform: translateX(5px) } 100% { transform: translateX(0) } }
`;
