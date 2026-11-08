"use client";
import { useEffect, useState } from "react";

const W = 8; // frame width = number of 1px laps

// One continuous rectangular spiral, 1px per lap, each lap a darker gray than the last (light outside to dark inside) for a bevel.
export default function Frame() {
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    const draw = () => {
      const w = document.documentElement.clientWidth, h = window.innerHeight;
      // Each lap ends one pixel inward, where the next lap starts, so the laps join into a spiral.
      setPaths(Array.from({ length: W }, (_, i) => `M${i + .5} ${i + .5} H${w - i - .5} V${h - i - .5} H${i + .5} V${i + 1.5} H${i + 1.5}`));
    };
    if (innerWidth <= 720) return; // hidden by CSS on phones
    draw();
    addEventListener("resize", draw);
    return () => removeEventListener("resize", draw);
  }, []);
  return (
    <div aria-hidden className="adm-frame" style={{ position: "fixed", inset: 0, border: `${W}px solid #fff`, zIndex: 99998, pointerEvents: "none" }}>
      <svg style={{ position: "absolute", left: -W, top: -W, width: "100vw", height: "100vh", overflow: "visible" }}>{paths.map((d, i) => <path key={i} d={d} fill="none" stroke={`hsl(0 0% ${95 - i * 12}%)`} strokeWidth="1" />)}</svg>
    </div>
  );
}
