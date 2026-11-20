"use client";
import type { ReactNode } from "react";
import { useState } from "react";

/** The shared look of a System settings block: title, a status badge (ok / bad / off), a hint, then the fields and actions. */
export function Card({ title, status, hint, children }: { title: string; status?: { kind: "ok" | "bad" | "off"; text: string }; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="card set-card">
      <div className="set-head"><h2>{title}</h2>{status && <span className={"set-badge " + status.kind} role="status">{status.text}</span>}</div>
      {hint && <p className="sub">{hint}</p>}
      {children}
    </section>
  );
}

/** A secret field: when one is saved it shows "saved" with a Replace button instead of an empty box that seems to mean "none". */
export function Secret({ label, saved, value, set, ph, area }: { label: string; saved: boolean; value: string; set: (v: string) => void; ph?: string; area?: boolean }) {
  const [replacing, setReplacing] = useState(false);
  if (saved && !replacing && !value) return <div><b>{label}</b><div className="set-secret"><span>•••••••• saved</span><button type="button" onClick={() => setReplacing(true)}>Replace</button></div></div>;
  return <label>{label}{area ? <textarea rows={4} value={value} placeholder={ph} onChange={(e) => set(e.target.value)} /> : <input type="password" value={value} placeholder={ph} autoComplete="new-password" onChange={(e) => set(e.target.value)} />}</label>;
}

/** Big status line at the top of a settings card: icon, what is true now, and what it means. */
export function Banner({ kind, title, children }: { kind: "ok" | "bad" | "warn" | "off"; title: string; children?: ReactNode }) {
  return <div className={"set-banner " + kind} role="status"><span className="ico" aria-hidden>{{ ok: "✅", bad: "⚠️", warn: "⏳", off: "⚪" }[kind]}</span><div><b>{title}</b>{children && <span>{children}</span>}</div></div>;
}

/** An outlined text field with a label above and helper text below; `error` replaces the helper and turns it red. */
export function Field({ label, value, set, ph, help, error, mono }: { label: string; value: string; set: (v: string) => void; ph?: string; help?: ReactNode; error?: string; mono?: boolean }) {
  return <label className={"set-field" + (error ? " bad" : "") + (mono ? " mono" : "")}><span>{label}</span><input value={value} placeholder={ph} autoComplete="off" spellCheck={false} aria-invalid={!!error} onChange={(e) => set(e.target.value)} /><small>{error || help}</small></label>;
}

/** Numbered setup steps, open until the thing is set up. */
export function Steps({ open, children }: { open: boolean; children: ReactNode }) {
  return <details className="set-steps" open={open}><summary>How to set this up</summary><ol>{children}</ol></details>;
}

/** A short confirmation at the bottom of the screen that goes away by itself. */
export function useSnack() {
  const [text, setText] = useState("");
  return [text ? <div className="set-snack" role="status">{text}</div> : null, (t: string) => { setText(t); setTimeout(() => setText(""), 4000); }] as const;
}
