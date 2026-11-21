"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { alertDialog } from "@/components/dialog";
import { training } from "./rpc";

type Tool = { id: number; name: string; category: string };
type Who = { id: number; name: string; email: string };

/** Start hands-on training with someone, no online test: for tools without a test, or any tool while online tests are off. Shown only to people who may act on such a tool. */
export default function HandsOn() {
  const [tools, setTools] = useState<Tool[]>([]), [open, setOpen] = useState(false), [q, setQ] = useState(""), [found, setFound] = useState<Who[]>([]), [who, setWho] = useState<Who | null>(null), [tool, setTool] = useState(0), [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => { training<Tool[]>("handsOnTools").then((t) => { setTools(t); if (t[0]) setTool(t[0].id); }, () => {}); }, []);
  useEffect(() => {
    if (!open || who || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => training<Who[]>("memberSearch", { q }).then(setFound, () => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, who, open]);
  if (!tools.length) return null;
  const go = () => { if (!who) return; setBusy(true); training<{ id: number }>("beginHandsOn", { user: who.id, tool }).then((r) => router.push(`/admin/people/training/cert/${r.id}`), (e) => { alertDialog(e.message); setBusy(false); }); };
  return (
    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
      {!open ? <button className="pri" onClick={() => setOpen(true)}>+ Start hands-on training with someone</button> : (
        <div style={{ display: "grid", gap: 8 }}>
          <b>Start hands-on training</b>
          <span className="sub" style={{ margin: 0 }}>For a tool with no online test. You then add notes and sign them off, and they get the authorization.</span>
          {who ? <p style={{ margin: 0 }}>{who.name} <span className="sub" style={{ margin: 0 }}>{who.email}</span> <button onClick={() => { setWho(null); setQ(""); }}>Change</button></p> : (
            <>
              <input aria-label="Find a member" placeholder="Find a member by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
              {found.map((m) => <button key={m.id} style={{ textAlign: "left" }} onClick={() => setWho(m)}>{m.name} <span className="sub" style={{ margin: 0 }}>{m.email}</span></button>)}
            </>
          )}
          <label>Tool <select value={tool} onChange={(e) => setTool(Number(e.target.value))}>{tools.map((t) => <option key={t.id} value={t.id}>{t.name}{t.category ? ` (${t.category})` : ""}</option>)}</select></label>
          <div className="bar"><button className="pri" disabled={!who || busy} onClick={go}>Start training</button><button onClick={() => setOpen(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
