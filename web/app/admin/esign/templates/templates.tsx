"use client";
import Notice from "@/components/notice";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import type { Template } from "@/lib/sign";
import { board } from "../rpc";

export default function Templates({ initial }: { initial: Template[] }) {
  const [rows, setRows] = useState(initial), [msg, setMsg] = useState("");
  const [bulk, setBulk] = useState<number | null>(null), [list, setList] = useState("");
  const send = async (id: number) => { // one "Name, email" per line
    const people = list.split("\n").map((l) => l.split(/[,\t;]/).map((x) => x.trim())).filter((p) => p[0]).map((p) => (p[1] ? { name: p[0], email: p[1] } : { name: p[0].split("@")[0], email: p[0] }));
    setMsg(""); try { const r = await board("bulk", { id, people }); setMsg(`Sent ${r.sent}.${r.failed.length ? " Problems: " + r.failed.join("; ") : ""}`); if (!r.failed.length) { setBulk(null); setList(""); } } catch (e: any) { setMsg(e.message); }
  };
  const reload = async () => setRows(await board("templates"));
  const run = async (op: string, args: Record<string, unknown>) => { setMsg(""); try { await board(op, args); await reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <>
      <h1>Templates</h1>
      <p className="sub">Saved setups (document, people, fields, options) to start new documents from. A public link lets anyone sign their own copy with no account: it fills the one person left with a blank email. Create templates with "Save as template" on <a href="/admin/esign/new">New document</a>.</p>
      {msg && <Notice kind="error">{msg}</Notice>}
      <div className="card">
        {rows.map((t) => (
          <div key={t.id} className="bar" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <strong>{t.title}</strong><span className="tag">{t.has_pdf ? "PDF" : "text"}</span><span className="tag">{t.people} people</span>
            <button onClick={() => run("setPublic", { id: t.id, on: !t.public_token })}>{t.public_token ? "Turn public link off" : "Turn public link on"}</button>
            {t.public_token && <input readOnly value={`${location.origin}/sign/t/${t.public_token}`} onFocus={(e) => e.target.select()} style={{ width: 360 }} aria-label="Public link" />}
            <button onClick={() => setBulk(bulk === t.id ? null : t.id)}>Send to a list…</button>
            {bulk === t.id && <div style={{ flexBasis: "100%" }}><textarea value={list} onChange={(e) => setList(e.target.value)} rows={6} placeholder={"One person per line: Name, email\nAda Lovelace, ada@example.org"} style={{ width: "100%", boxSizing: "border-box" }} /><button className="pri" onClick={() => send(t.id)}>Email each person their own copy</button></div>}
            <button onClick={async () => { if (await confirmDialog(`Delete the template "${t.title}"? Documents already sent are not affected.`, { ok: "Delete", danger: true })) run("deleteTemplate", { id: t.id }); }}>Delete</button>
          </div>))}
        {!rows.length && <p className="sub">No templates yet.</p>}
      </div>
    </>
  );
}
