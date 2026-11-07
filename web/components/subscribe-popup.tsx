"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type F = { id: number; kind: "popup" | "slidein" | "bar" | "inline"; heading: string; body: string; button: string; success: string; delay: number; color: string; ask_name: boolean };
const SKIP = ["/admin", "/edit", "/mail", "/api"];
const key = (id: number) => "subscribe-form-" + id;
const hidden = (id: number) => { try { return Date.now() < Number(localStorage.getItem(key(id))); } catch { return false; } };
const hide = (id: number, days: number) => { try { localStorage.setItem(key(id), String(Date.now() + days * 864e5)); } catch {} };

// The signup forms configured at /mailadmin/forms. Pop-ups, slide-ins and bars appear after their delay;
// closing one hides it for 30 days, subscribing hides it for a year.
export default function SubscribeForms() {
  const path = usePathname();
  const [forms, setForms] = useState<F[]>([]);
  const skip = SKIP.some((p) => path.startsWith(p));
  useEffect(() => {
    if (skip) return;
    fetch("/api/subscribe").then((r) => r.json()).then((l: F[]) => setForms(Array.isArray(l) ? l.filter((f) => !hidden(f.id)) : [])).catch(() => {});
  }, [skip]);
  if (skip) return null;
  return <>{forms.map((f) => <Form key={f.id} f={f} />)}</>;
}

function Form({ f }: { f: F }) {
  const [show, setShow] = useState(f.kind === "inline");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { if (f.kind === "inline") return; const t = setTimeout(() => setShow(true), f.delay * 1000); return () => clearTimeout(t); }, [f]);
  if (!show) return null;
  const close = () => { setShow(false); hide(f.id, 30); };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setMsg("");
    const r = await fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ form: f.id, email, name, website: new FormData(e.currentTarget).get("website") }) });
    if (!r.ok) return setMsg(await r.text());
    setDone(true); setMsg((await r.json()).result === "confirm" ? "Almost there — check your inbox to confirm." : f.success || "Thank you!");
    hide(f.id, 365);
    if (f.kind !== "inline") setTimeout(() => setShow(false), 5000);
  };
  const bar = f.kind === "bar";
  const wrap: React.CSSProperties =
    f.kind === "popup" ? { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16 }
    : f.kind === "slidein" ? { position: "fixed", right: 16, bottom: 16, zIndex: 9999, width: "min(360px, calc(100vw - 32px))" }
    : bar ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999 }
    : { maxWidth: 520, margin: "32px auto", padding: "0 16px" };
  const card: React.CSSProperties = {
    background: "#fff", color: "#1c2024", font: "15px/1.4 system-ui,sans-serif", boxSizing: "border-box", position: "relative",
    ...(bar ? { padding: "12px 48px 12px 16px", boxShadow: "0 -4px 20px rgba(0,0,0,.2)", borderTop: `4px solid ${f.color}` }
      : { borderRadius: 12, padding: 22, boxShadow: "0 8px 32px rgba(0,0,0,.3)", width: f.kind === "popup" ? "min(420px, 100%)" : undefined }),
  };
  const input: React.CSSProperties = { padding: 10, boxSizing: "border-box", border: "1px solid #bbb", borderRadius: 6, font: "inherit" };
  const field = (w: number): React.CSSProperties => ({ ...input, width: bar ? w : "100%", marginBottom: bar ? 0 : 8 });
  return (
    <div style={wrap} onClick={f.kind === "popup" ? close : undefined}>
      <div role={f.kind === "inline" ? undefined : "dialog"} aria-label={f.heading || "Subscribe"} style={card} onClick={(e) => e.stopPropagation()}>
        {f.kind !== "inline" && <button onClick={close} aria-label="Close" style={{ position: "absolute", top: 8, right: 12, border: 0, background: "none", fontSize: 24, cursor: "pointer", color: "#555" }}>×</button>}
        {done ? <p role="status" style={{ margin: 0 }}>{msg}</p> : (
          <form onSubmit={submit} style={bar ? { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } : undefined}>
            <div style={bar ? { flex: "1 1 240px" } : undefined}>
              <strong style={{ fontSize: 18 }}>{f.heading}</strong>{f.body && <p style={{ margin: bar ? 0 : "6px 0 12px" }}>{f.body}</p>}
            </div>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: -9999 }} />
            {f.ask_name && <input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} style={field(160)} />}
            <input type="email" required aria-label="Email address" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={field(220)} />
            <button type="submit" style={{ ...input, background: f.color, color: "#fff", border: 0, fontWeight: 700, cursor: "pointer", width: bar ? "auto" : "100%" }}>{f.button}</button>
            {msg && <p role="alert" style={{ color: "#b00020", margin: "8px 0 0" }}>{msg}</p>}
          </form>)}
      </div>
    </div>
  );
}
