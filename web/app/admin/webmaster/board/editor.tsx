"use client";
import { useDirtyGuard } from "@/components/dirty-guard";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { ImageInput } from "@/components/image-field";
import Revisions from "../revisions";
import type { Board } from "@/lib/store";

type Member = Board["members"][number];

export default function BoardAdmin({ initial }: { initial: Board }) {
  const [b, setB] = useState(initial);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(0);
  useDirtyGuard(b, saved);
  const set = (members: Member[]) => setB({ ...b, members });
  const upd = (i: number, p: Partial<Member>) => set(b.members.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const move = (i: number, d: number) => { const l = [...b.members]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); set(l); };
  const save = async () => {
    const r = await fetch("/api/webmaster/board", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    setMsg(r.ok ? "Saved." : await r.text());
    setSaved(saved + 1);
  };
  return (
    <>
      <h1>Board</h1>
      <p className="sub">Members shown on the <a href="/board">board page</a>, in this order.</p>
      {msg && <p className="sub">{msg}</p>}
      <div className="card" style={{ padding: 12 }}>
        <input style={{ width: "100%" }} aria-label="Heading" value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} />
        <textarea style={{ width: "100%" }} rows={4} aria-label="Intro" value={b.intro} onChange={(e) => setB({ ...b, intro: e.target.value })} />
      </div>
      {b.members.map((m, i) => (
        <div className="card" style={{ padding: 12, marginTop: 8 }} key={i}>
          {m.photo && <img src={m.photo.startsWith("/") ? m.photo : "/" + m.photo} alt="" style={{ height: 80, float: "right" }} />}
          <input aria-label="Name" placeholder="Name" value={m.name} onChange={(e) => upd(i, { name: e.target.value })} />{" "}
          <input aria-label="Role" placeholder="Role" value={m.role} onChange={(e) => upd(i, { role: e.target.value })} />{" "}
          <button disabled={!i} onClick={() => move(i, -1)}>↑</button>
          <button disabled={i === b.members.length - 1} onClick={() => move(i, 1)}>↓</button>{" "}
          <button aria-label="Duplicate" title="Duplicate this member" onClick={() => set([...b.members.slice(0, i + 1), { ...m }, ...b.members.slice(i + 1)])}>⧉</button>{" "}
          <button className="danger" aria-label="Remove" onClick={async () => (await confirmDialog(`Remove ${m.name || "member"}?`, { ok: "Remove", danger: true })) && set(b.members.filter((_, j) => j !== i))}>✕</button>
          <textarea style={{ width: "100%", marginTop: 6 }} rows={4} aria-label="Bio" placeholder="Bio (blank line = new paragraph)" value={m.bio} onChange={(e) => upd(i, { bio: e.target.value })} />
          <ImageInput value={m.photo} onChange={(photo) => upd(i, { photo })} />
        </div>
      ))}
      <div className="bar" style={{ marginTop: 8 }}>
        <button onClick={() => set([...b.members, { name: "", role: "", bio: "", photo: "" }])}>+ add member</button>
        <button className="pri" onClick={save}>Save</button>
      </div>
      <Revisions<Board> api="/api/webmaster/board" reload={saved}
        lines={(d) => [`Heading: ${d.title}`, `Intro: ${d.intro}`, ...d.members.map((m) => `${m.name} · ${m.role} · ${m.photo} · ${m.bio}`)]}
        onRevert={async (r) => { setB(await r.json()); setMsg("Reverted."); }} />
    </>
  );
}
