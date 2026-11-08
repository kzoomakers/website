"use client";
import Flash from "@/components/flash";
import { useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { uploadImage } from "@/components/image-field";
import { uploadBatch } from "@/lib/upload-client";
import type { Media } from "@/lib/media";

export default function Library({ initial }: { initial: Media[] }) {
  const [items, setItems] = useState(initial);
  const [msg, setMsg] = useState("");
  const reload = async () => setItems(await (await fetch("/api/webmaster/media")).json());
  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    setMsg(`Uploading 0 of ${list.length}…`);
    const bad = (await uploadBatch(list, (f) => uploadImage(f), (d, n) => setMsg(`Uploading ${d} of ${n}…`))).filter((r): r is Error => r instanceof Error);
    setMsg(bad.length ? `${bad.length} of ${list.length} failed: ${bad[0].message}` : ""); reload();
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
      <div className="bar"><input type="file" multiple accept="image/*,.heic,.heif" onChange={(e) => upload(e.target.files)} />{msg.startsWith("Uploading") && <span>{msg}</span>}</div>
      {!msg.startsWith("Uploading") && <Flash msg={msg} />}
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
