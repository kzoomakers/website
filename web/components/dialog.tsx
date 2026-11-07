"use client";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// Modal replacements for window.confirm/prompt/alert. Imperative (no provider), so they work anywhere,
// including inside the Puck editor. Built on <dialog>.showModal(): focus trap, Esc to cancel, inert page behind.
type Opts = { ok?: string; danger?: boolean; cancel?: boolean; input?: string };

const CSS = `
dialog.dlg{border:0;border-radius:14px;padding:0;max-width:440px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.35);color:#1a1a1a;background:#fff;font:15px/1.45 system-ui,sans-serif}
dialog.dlg::backdrop{background:rgba(0,0,0,.45)}
dialog.dlg form{padding:20px 24px}
dialog.dlg p{margin:0 0 16px;white-space:pre-line}
dialog.dlg input{width:100%;box-sizing:border-box;padding:8px 10px;margin:0 0 16px;font:inherit;border:1px solid #bbb;border-radius:8px}
dialog.dlg .dlg-bar{display:flex;justify-content:flex-end;gap:8px}
dialog.dlg button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #ccc;background:#f4f4f4;cursor:pointer}
dialog.dlg button.dlg-pri{background:#2563eb;border-color:#2563eb;color:#fff}
dialog.dlg button.dlg-danger{background:#c62828;border-color:#c62828;color:#fff}
dialog.dlg button:focus-visible,dialog.dlg input:focus-visible{outline:2px solid #2563eb;outline-offset:2px}`;

function Dlg({ message, o, done }: { message: string; o: Opts; done: (ok: boolean, v: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState(o.input ?? "");
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="dlg" aria-label={message}
      onCancel={(e) => { e.preventDefault(); done(false, ""); }}
      onClick={(e) => { if (e.target === ref.current) done(false, ""); }}>
      <style>{CSS}</style>
      <form onSubmit={(e) => { e.preventDefault(); done(true, v); }}>
        <p>{message}</p>
        {o.input !== undefined && <input autoFocus aria-label={message} value={v} onChange={(e) => setV(e.target.value)} />}
        <div className="dlg-bar">
          {o.cancel !== false && <button type="button" onClick={() => done(false, "")}>Cancel</button>}
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
export const promptDialog = async (message: string, def = "") => { const r = await ask(message, { input: def }); return r.ok ? r.v : null; };
export const alertDialog = async (message: string) => { await ask(message, { cancel: false }); };
