"use client";
import { useEffect, useRef } from "react";

/** A high-contrast error banner that scrolls into view and takes focus, so a failed upload can't be missed. Renders nothing when `msg` is empty. */
export default function Flash({ msg }: { msg: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => { if (msg) { el.current?.scrollIntoView({ behavior: "smooth", block: "center" }); el.current?.focus(); } }, [msg]);
  if (!msg) return null;
  return (
    <>
      <div ref={el} tabIndex={-1} role="alert" style={{ color: "#fff", background: "#b00020", border: "2px solid #7a0016", borderRadius: 8, padding: "12px 16px", fontWeight: 600, margin: "8px 0", animation: "flash-shake .4s", textAlign: "left" }}>⚠️ {msg}</div>
      <style>{"@keyframes flash-shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}"}</style>
    </>
  );
}
