"use client";
import type { ReactNode } from "react";

// Shared "statement, then I agree" block: the statement is plain text, the animated tick sits underneath. Colours follow the theme (--acc, --ink, --mut, --line).
const CSS = `.agree{display:grid;gap:12px;padding:14px 16px;border:1px solid var(--line,#ccc);border-radius:12px;background:var(--card,transparent)}
.agree p{margin:0;line-height:1.45}
.agree label{display:flex!important;align-items:center;gap:12px;width:fit-content;cursor:pointer;user-select:none;font-weight:600;color:var(--ink,inherit)}
.agree input[type=checkbox]{appearance:none;-webkit-appearance:none;position:relative;flex:none;box-sizing:border-box;width:28px;height:28px;min-height:0;margin:0;padding:0;border:2px solid var(--mut,#666);border-radius:6px;background:transparent;transition:border-color .2s}
.agree input[type=checkbox]:checked{border-color:var(--acc,#2f6fed)}
.agree input[type=checkbox]::before,.agree input[type=checkbox]::after{content:"";position:absolute;background:var(--acc,#2f6fed);width:3px;border-radius:2px;transition:transform 0s}
.agree input[type=checkbox]::before{height:10px;top:11px;left:6px;transform:scale(0) rotate(-40deg);transform-origin:top left}
.agree input[type=checkbox]::after{height:18px;left:12px;top:1px;transform:scale(0) rotate(38deg);transform-origin:bottom left}
.agree input[type=checkbox]:checked::before{transform:scale(1) rotate(-40deg);transition:transform .15s}
.agree input[type=checkbox]:checked::after{transform:scale(1) rotate(38deg);transition:transform .25s .15s}
.agree input[type=checkbox]:focus-visible{outline:3px solid color-mix(in srgb,var(--acc,#2f6fed) 45%,transparent);outline-offset:2px}
@media(prefers-reduced-motion:reduce){.agree input[type=checkbox]::before,.agree input[type=checkbox]::after{transition:none!important}}`;

export default function Agree({ checked, onChange, children, label = "I agree" }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; label?: string }) {
  return <div className="agree"><style>{CSS}</style><p>{children}</p><label><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label></div>;
}
