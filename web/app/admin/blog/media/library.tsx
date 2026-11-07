"use client";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { uploadImage } from "@/components/image-field";
import type { Media } from "@/lib/media";

export default function Library({ initial }: { initial: Media[] }) {
  const [items, setItems] = useState(initial);
  const [msg, setMsg] = useState("");
  const reload = async () => setItems(await (await fetch("/api/webmaster/media")).json());
  const upload = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      setMsg(`Uploading ${f.name}…`);
      try { await uploadImage(f); } catch (e: any) { return setMsg(e.message); }
    }
    setMsg(""); reload();
  };
  const alt = (m: Media, v: string) => setItems(items.map((x) => (x.id === m.id ? { ...x, alt: v } : x)));
  const saveAlt = (m: Media) => fetch("/api/webmaster/media", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id, alt: m.alt }) });
  const del = async (m: Media) => {
    if (!(await confirmDialog(`Delete ${m.filename || m.key}? Posts and pages using it will show a broken image.`, { ok: "Delete", danger: true }))) return;
    await fetch(`/api/webmaster/media?id=${m.id}`, { method: "DELETE" });
    reload();
  };
  return (
    <>
      <h1>Media</h1>
      <p className="sub">Every image uploaded in the admin. Alt text describes the image for screen readers and search engines.</p>
      <div className="bar"><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => upload(e.target.files)} />{msg && <span>{msg}</span>}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {items.map((m) => (
          <div className="card" key={m.id} style={{ padding: 8 }}>
            <img src={`/uploads/${m.key}`} alt={m.alt} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }} />
            <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.filename} · {Math.round(m.size / 1024)} KB</small>
            <input style={{ width: "100%" }} aria-label="Alt text" placeholder="Alt text" value={m.alt} onChange={(e) => alt(m, e.target.value)} onBlur={() => saveAlt(m)} />
            <div className="bar" style={{ margin: "6px 0 0" }}>
              <button onClick={() => navigator.clipboard.writeText(`/uploads/${m.key}`)}>Copy URL</button>
              <button className="danger" onClick={() => del(m)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {!items.length && <p className="sub">Nothing uploaded yet.</p>}
    </>
  );
}
