"use client";
import Flash from "@/components/flash";
import { useEffect, useState } from "react";
import { uploadImage } from "@/components/image-field";
import { uploadBatch } from "@/lib/upload-client";
import type { Media } from "@/lib/media";

export const mediaUrl = (m: Media) => `/uploads/${m.key}`;

/** Modal grid of the media library with upload; calls onPick with the chosen image. */
export function MediaPicker({ onPick, onClose }: { onPick: (url: string, alt: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<Media[]>([]);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/webmaster/media").then((r) => r.json()).then(setItems).catch(() => setMsg("Could not load the library."));
  useEffect(() => { load(); }, []);
  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    setMsg(`Uploading 0 of ${list.length}…`);
    const bad = (await uploadBatch(list, (f) => uploadImage(f), (d, n) => setMsg(`Uploading ${d} of ${n}…`))).filter((r): r is Error => r instanceof Error);
    setMsg(bad.length ? `${bad.length} of ${list.length} failed: ${bad[0].message}` : ""); load();
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Media library" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100000, display: "grid", placeItems: "center" }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "min(900px, 94vw)", maxHeight: "86vh", overflow: "auto", padding: 16 }}>
        <div className="bar"><strong style={{ flex: 1 }}>Media library</strong><input type="file" multiple accept="image/*,.heic,.heif" onChange={(e) => upload(e.target.files)} /><button onClick={onClose}>Close</button></div>
        {msg.startsWith("Uploading") ? <p className="sub">{msg}</p> : <Flash msg={msg} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
          {items.map((m) => (
            <button key={m.id} onClick={() => onPick(mediaUrl(m), m.alt)} title={m.filename} style={{ padding: 4 }}>
              <img src={mediaUrl(m)} alt={m.alt} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 4 }} />
              <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.filename}</small>
            </button>
          ))}
        </div>
        {!items.length && <p className="sub">Nothing uploaded yet.</p>}
      </div>
    </div>
  );
}

/** URL field with thumbnail, "choose from library" and clear. */
export function ImagePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {value && <img src={value} alt="" style={{ display: "block", maxHeight: 90, maxWidth: "100%", borderRadius: 6, marginBottom: 6 }} />}
      <div className="bar" style={{ marginBottom: 0 }}>
        <input style={{ flex: 1 }} aria-label="Image URL" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Featured image URL" />
        <button onClick={() => setOpen(true)}>Choose from library</button>
        {value && <button onClick={() => onChange("")}>Clear</button>}
      </div>
      {open && <MediaPicker onClose={() => setOpen(false)} onPick={(u) => { onChange(u); setOpen(false); }} />}
    </div>
  );
}
