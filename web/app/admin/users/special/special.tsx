"use client";
import { useState } from "react";
import Notice, { msgKind } from "@/components/notice";

type Admin = { email: string; name: string };
export default function Special({ perms, initial, admins, canEdit }: { perms: { k: string; label: string }[]; initial: Record<string, string[]>; admins: Admin[]; canEdit: boolean }) {
  const [list, setList] = useState(initial), [msg, setMsg] = useState(""), [pick, setPick] = useState<Record<string, string>>({});
  const set = async (perm: string, email: string, on: boolean) => {
    setMsg("");
    const r = await fetch("/api/special", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perm, email, on }) });
    if (r.ok) setList(await r.json()); else setMsg(await r.text());
  };
  return <>
    <h1>Special permissions</h1>
    <p className="sub">Some actions are limited to the people listed here, on top of normal admin access. If a list is empty, any full administrator can do it, so nobody is locked out while you set it up. Once someone is listed, only the people listed can.</p>
    <Notice kind={msgKind(msg)}>{msg}</Notice>
    {perms.map(({ k, label }) => {
      const who = list[k] ?? [], free = admins.filter((a) => !who.includes(a.email.toLowerCase()));
      return <section key={k} className="card" style={{ display: "grid", gap: 8, maxWidth: 640, marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>{label}</h2>
        {who.length ? <ul style={{ margin: 0 }}>{who.map((e) => <li key={e}>{e} {canEdit && <button type="button" onClick={() => set(k, e, false)} aria-label={`Remove ${e}`}>Remove</button>}</li>)}</ul>
          : <p className="sub" style={{ margin: 0 }}>Nobody listed: any full administrator may.</p>}
        {canEdit && <div className="bar">
          <select aria-label="Choose an administrator" value="" onChange={(e) => e.target.value && set(k, e.target.value, true)}><option value="">Add an administrator…</option>{free.map((a) => <option key={a.email} value={a.email}>{a.name} ({a.email})</option>)}</select>
          <input type="email" placeholder="or type an email" value={pick[k] ?? ""} onChange={(e) => setPick({ ...pick, [k]: e.target.value })} />
          <button type="button" disabled={!pick[k]} onClick={() => { set(k, pick[k], true); setPick({ ...pick, [k]: "" }); }}>Add</button>
        </div>}
      </section>;
    })}
  </>;
}
