"use client";
import { useEffect, useRef, useState } from "react";

/** Typed name (required) plus an optional drawn signature, and the consent tick. Calls onSign(typed, drawnPngDataUrl). */
export default function SignPad({ name, busy, label = "Sign", initials: wantInitials = false, drawRequired = false, onSign }: { name: string; busy: boolean; label?: string; initials?: boolean; drawRequired?: boolean; onSign: (typed: string, drawn: string, initials: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null), [typed, setTyped] = useState(""), [ini, setIni] = useState(""), [ok, setOk] = useState(false), [inked, setInked] = useState(false);
  useEffect(() => {
    const c = cv.current!, x = c.getContext("2d")!;
    x.lineWidth = 2.2; x.lineCap = "round"; x.strokeStyle = "#111";
    let down = false;
    const at = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
    const d = (e: PointerEvent) => { down = true; c.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...(at(e) as [number, number])); };
    const m = (e: PointerEvent) => { if (!down) return; x.lineTo(...(at(e) as [number, number])); x.stroke(); setInked(true); };
    const u = () => { down = false; };
    c.addEventListener("pointerdown", d); c.addEventListener("pointermove", m); c.addEventListener("pointerup", u);
    return () => { c.removeEventListener("pointerdown", d); c.removeEventListener("pointermove", m); c.removeEventListener("pointerup", u); };
  }, []);
  const clear = () => { const c = cv.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setInked(false); };
  return (
    <form className="card" style={{ display: "grid", gap: 10, maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); onSign(typed, inked ? cv.current!.toDataURL("image/png") : "", ini); }}>
      <label>Type your full legal name<input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your name here" autoComplete="name" required minLength={2} maxLength={100} style={{ width: "100%", boxSizing: "border-box" }} />{name && typed !== name && <button type="button" style={{ display: "block", border: 0, background: "none", padding: "10px 0 0", font: "inherit", cursor: "pointer", color: "var(--acc, #2f6fed)", textDecoration: "underline" }} onClick={() => { setTyped(name); if (wantInitials && !ini) setIni(name.split(/\s+/).map((w) => w[0]).join("").slice(0, 6).toUpperCase()); }}>Use “{name}”</button>}</label>
      {wantInitials && <label>Your initials (up to 6 letters, printed at the foot of every page)<input value={ini} onChange={(e) => setIni(e.target.value.toUpperCase())} maxLength={6} required placeholder="e.g. RR" autoCapitalize="characters" autoComplete="off" style={{ width: 90, marginLeft: 8 }} /></label>}
      <div>
        <div className="sub" style={{ margin: "0 0 4px" }}>{drawRequired ? "Draw your signature (required)" : "Optional: draw your signature"}</div>
        <canvas ref={cv} width={520} height={140} aria-label="Signature drawing area" style={{ width: "100%", height: 140, border: "1px solid var(--line, #ccc)", borderRadius: 8, background: "#fff", touchAction: "none" }} />
        <button type="button" onClick={clear}>Clear drawing</button>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />I have read this document and agree that my typed or drawn signature is my legal electronic signature.</label>
      <button className="pri" type="submit" disabled={busy || !ok || typed.trim().length < 2 || (wantInitials && !ini.trim()) || (drawRequired && !inked)}>{busy ? "Signing…" : label}</button>
    </form>
  );
}
