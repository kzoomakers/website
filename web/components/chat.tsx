"use client";
import { useEffect, useRef } from "react";

export type Bub = { id: number | string; mine: boolean; note?: boolean; name: string; body: string; at: string };

// One chat look for every conversation on the site (tours, contact replies, member messages). Dark side list is only used in the members inbox.
export const CHAT_CSS = `
.ch{background:#f4f4f4;border-radius:10px;overflow:hidden;color:#626c76;display:flex;flex-direction:column;min-width:0}
.ch-msgs{display:flex;flex-direction:column;overflow-y:auto;max-height:min(60vh,560px);min-height:140px;padding:6px 0}
.ch-split{display:flex;align-items:center;justify-content:center;color:#8a8f94;font-size:12px;margin:10px 0}
.ch-split:before,.ch-split:after{content:"";height:1px;width:60px;background:#c4c3c3;margin:0 14px}
.ch-m{display:flex;margin:10px 16px;position:relative;gap:10px;align-items:flex-start}
.ch-av{flex:none;width:38px;height:38px;border-radius:50%;background:#363e47;color:#fff;display:grid;place-items:center;font-size:14px;font-weight:700}
.ch-c{max-width:min(72%,560px);background:#fff;padding:11px 14px;border-radius:0 10px 10px 10px;position:relative;color:#3c444c}
.ch-c:before{content:"";position:absolute;top:0;left:-8px;border-style:solid;border-width:0 9px 9px 0;border-color:transparent #fff transparent transparent}
.ch-t{white-space:pre-wrap;overflow-wrap:anywhere}.ch-w{font-size:11.5px;color:#8a8f94;margin-top:4px}
.ch-m.me{flex-direction:row-reverse}.ch-m.me .ch-av{background:#01e777;color:#04331c}
.ch-m.me .ch-c{background:#01e777;color:#04331c;border-radius:10px 0 10px 10px}.ch-m.me .ch-c:before{left:auto;right:-8px;border-width:9px 9px 0 0;border-color:#01e777 transparent transparent transparent}
.ch-m.me .ch-w{color:#0a5c35}
.ch-m.note .ch-c{background:#fff8dc;border:1px dashed #d9b84a;color:#3c3320;max-width:90%}.ch-m.note .ch-c:before{display:none}
.ch-bar{background:#fff;display:flex;align-items:flex-end;gap:10px;padding:12px 14px;border-top:1px solid #e3e3e3}
.ch-bar textarea{flex:1;min-width:0;border:0;background:#ececec;border-radius:22px;padding:11px 16px;font:inherit;font-size:16px;color:#222;resize:none;max-height:140px}
.ch-bar textarea:focus{outline:2px solid #0091e9}
.ch-bar textarea.note{background:#fff8dc}
.ch-send{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:#0091e9;display:grid;place-items:center;cursor:pointer;padding:0}
.ch-send:hover{background:#1cc1f3}.ch-send:disabled{opacity:.5;cursor:default}.ch-send svg{width:22px;height:22px;fill:#fff}
.ch-opt{background:#fff;padding:8px 16px 0;font-size:14px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}.ch-opt label{margin:0;font-weight:400}
.ch-err{color:#b3261e;padding:6px 16px;background:#fff;margin:0}
.ch-wrap{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);border-radius:10px;overflow:hidden;background:#f4f4f4}
.ch-side{background:#363e47;min-width:0}.ch-side h2{margin:0;padding:18px 16px;background:#303841;color:#fff;font-size:16px}
.ch-th{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 12px;align-items:center;padding:12px 16px;color:#fff;text-decoration:none;border-bottom:1px solid #303841}
.ch-th:hover,.ch-th.on{background:#3f4953;color:#fff;text-decoration:none}.ch-th .ch-av{grid-row:span 2;background:#0091e9}
.ch-th b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ch-th small{color:#9aa4ae;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;grid-column:2}
.ch-th i{grid-row:span 2;font-style:normal;font-size:11px;background:#0091e9;color:#fff;border-radius:11px;padding:2px 8px}
.ch-main{min-width:0;display:flex;flex-direction:column}.ch-top{background:#fff;border-bottom:1px solid #d6d6d6;padding:14px 18px;font-size:18px;font-weight:600;color:#333}
@media(max-width:720px){.ch-wrap{grid-template-columns:1fr}.ch-side.hide-sm{display:none}.ch-c{max-width:82%}}
`;

const initials = (n: string) => (n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
const day = (d: string) => new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const time = (d: string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The message list: avatars, tails, a date line between days, scrolled to the newest. */
export function Msgs({ items, empty }: { items: Bub[] | null; empty?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [items?.length]);
  return (
    <div className="ch-msgs" ref={box} role="log" aria-live="polite">
      {items && !items.length && <p style={{ margin: 16 }}>{empty ?? "No messages yet."}</p>}
      {items?.map((m, i) => (
        <div key={m.id}>
          {(i === 0 || day(items[i - 1].at) !== day(m.at)) && <div className="ch-split">{day(m.at)}</div>}
          <div className={`ch-m${m.mine ? " me" : ""}${m.note ? " note" : ""}`}>
            <div className="ch-av" aria-hidden>{m.note ? "🔒" : initials(m.name)}</div>
            <div className="ch-c"><div className="ch-t">{m.body}</div><div className="ch-w">{m.note ? "Internal note · " : ""}{m.mine ? "You" : m.name} · {time(m.at)}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rounded input with a round send button. Cmd/Ctrl+Enter sends. */
export function Bar({ value, set, go, busy, label, placeholder, note, max = 4000 }: { value: string; set: (v: string) => void; go: () => void; busy: boolean; label: string; placeholder: string; note?: boolean; max?: number }) {
  return (
    <div className="ch-bar">
      <textarea aria-label={label} rows={2} maxLength={max} value={value} placeholder={placeholder} className={note ? "note" : ""} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); }} />
      <button type="button" className="ch-send" aria-label="Send" disabled={busy || !value.trim()} onClick={go}><svg viewBox="0 0 24 24" aria-hidden><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg></button>
    </div>
  );
}
