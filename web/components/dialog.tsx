"use client";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// Modal replacements for window.confirm/prompt/alert. Imperative (no provider), so they work anywhere,
// including inside the Puck editor. Built on <dialog>.showModal(): focus trap, Esc to cancel, inert page behind.
type Opts = { ok?: string; cancelLabel?: string; title?: string; danger?: boolean; cancel?: boolean; input?: string; multiline?: boolean };

const CSS = `
dialog.dlg{border:0;border-radius:14px;padding:0;max-width:440px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.35);color:var(--dlg-ink,#1a1a1a);background:var(--dlg-bg,#fff);color-scheme:light;font:15px/1.45 system-ui,sans-serif}
@media (prefers-color-scheme:dark){dialog.dlg{--dlg-ink:#e8eaed;--dlg-bg:#1a1d21;--dlg-btn:#2a2e35;--dlg-bd:#8b93a1;color-scheme:dark}dialog.dlg input,dialog.dlg textarea{background:#111316;color:#e8eaed}}
dialog.dlg::backdrop{background:rgba(0,0,0,.45)}
dialog.dlg form{padding:20px 24px}
dialog.dlg p{margin:0 0 16px;white-space:pre-line}
dialog.dlg input,dialog.dlg textarea{width:100%;box-sizing:border-box;padding:8px 10px;margin:0 0 16px;font:inherit;border:1px solid var(--dlg-bd,#767676);border-radius:8px}
dialog.dlg .dlg-bar{display:flex;justify-content:flex-end;gap:8px}
dialog.dlg button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid var(--dlg-bd,#767676);background:var(--dlg-btn,#f4f4f4);color:var(--dlg-ink,#1a1a1a);cursor:pointer}
dialog.dlg button.dlg-pri{background:#2563eb;border-color:#2563eb;color:#fff}
dialog.dlg button.dlg-danger{background:#c62828;border-color:#c62828;color:#fff}
dialog.dlg button:focus-visible,dialog.dlg input:focus-visible,dialog.dlg textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}`;

function Dlg({ message, o, done }: { message: string; o: Opts; done: (ok: boolean, v: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState(o.input ?? "");
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="dlg" aria-labelledby={o.title ? "dlg-t" : "dlg-d"}
      onCancel={(e) => { e.preventDefault(); done(false, ""); }}
      onClick={(e) => { if (e.target === ref.current) done(false, ""); }}>
      <style>{CSS}</style>
      <form onSubmit={(e) => { e.preventDefault(); done(true, v); }}>
        {o.title && <h2 id="dlg-t" style={{ margin: "0 0 8px", fontSize: 18 }}>{o.title}</h2>}
        <p id="dlg-d">{message}</p>
        {o.input !== undefined && (o.multiline
          ? <textarea autoFocus rows={6} aria-labelledby={o.title ? "dlg-t" : "dlg-d"} value={v} onChange={(e) => setV(e.target.value)} style={{ resize: "vertical" }} />
          : <input autoFocus aria-labelledby={o.title ? "dlg-t" : "dlg-d"} value={v} onChange={(e) => setV(e.target.value)} />)}
        <div className="dlg-bar">
          {o.cancel !== false && <button type="button" onClick={() => done(false, "")}>{o.cancelLabel ?? "Cancel"}</button>}
          <button autoFocus={o.input === undefined} className={o.danger ? "dlg-danger" : "dlg-pri"}>{o.ok ?? "OK"}</button>
        </div>
      </form>
    </dialog>
  );
}

function ask(message: string, o: Opts) {
  return new Promise<{ ok: boolean; v: string }>((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<Dlg message={message} o={o} done={(ok, v) => { root.unmount(); host.remove(); resolve({ ok, v }); }} />);
  });
}

export const confirmDialog = async (message: string, o: Omit<Opts, "input" | "cancel"> = {}) => (await ask(message, o)).ok;
export const promptDialog = async (message: string, def = "", o: Pick<Opts, "multiline" | "ok" | "title"> = {}) => { const r = await ask(message, { input: def, ...o }); return r.ok ? r.v : null; };
export const alertDialog = async (message: string) => { await ask(message, { cancel: false }); };
