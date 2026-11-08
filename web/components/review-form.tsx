"use client";
import Flash from "./flash";
import { sendUpload } from "@/lib/upload-client";
import { fileTooLarge } from "@/lib/upload-limit";
import { useEffect, useState } from "react";

// "Leave a review" under the homepage reviews. Signed-in state is fetched client-side so the page stays cacheable.
export function ReviewForm() {
  const [me, setMe] = useState<{ name: string } | null | undefined>(undefined), [text, setText] = useState(""), [role, setRole] = useState(""), [msg, setMsg] = useState(""), [done, setDone] = useState(false), [busy, setBusy] = useState(false), [photo, setPhoto] = useState<File | null>(null), [preview, setPreview] = useState("");
  useEffect(() => { fetch("/api/blog/auth").then((r) => r.json()).then(setMe, () => setMe(null)); }, []);
  if (me === undefined) return null;
  const box = { maxWidth: 560, margin: "40px auto 0", textAlign: "center" as const };
  if (!me) return <div style={box}><a className="btn btn-main" href={`/login?next=${encodeURIComponent("/#testimonial")}`}>Sign in to leave a review</a></div>;
  if (done) return <p role="status" style={box}>Thank you, {me.name.split(" ")[0]}! Your review will appear on the site once a volunteer has read it.</p>;
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    const fd = new FormData(); fd.set("text", text); fd.set("role", role); if (photo) fd.set("photo", photo);
    const r = await sendUpload("/api/reviews", fd);
    setBusy(false);
    if (r?.ok) setDone(true); else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  return (
    <form onSubmit={go} style={{ ...box, display: "grid", gap: 10, textAlign: "left" }}>
      <h3 style={{ textAlign: "center", margin: 0 }}>Leave a review</h3>
      <textarea required rows={4} minLength={10} maxLength={800} aria-label="Your review" placeholder="What has the makerspace meant to you?" value={text} onChange={(e) => setText(e.target.value)} />
      <input aria-label="Your role (optional)" placeholder="Your role, e.g. Makerspace Member (optional)" maxLength={60} value={role} onChange={(e) => setRole(e.target.value)} />
      <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        {preview ? <img src={preview} alt="Your photo" width={56} height={56} style={{ borderRadius: "50%", objectFit: "cover" }} />
          : <span aria-hidden style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(127,127,127,.25)", display: "grid", placeItems: "center", fontSize: 24 }}>📷</span>}
        <span>{photo ? "Change photo" : "Add a photo of yourself (optional)"}
          <input type="file" accept="image/*,.heic,.heif" style={{ display: "block" }} onChange={(e) => {
            const f = e.target.files?.[0] ?? null; setMsg(f ? fileTooLarge(f) : ""); if (f && fileTooLarge(f)) { e.target.value = ""; return; } setPhoto(f); setPreview((old) => { if (old) URL.revokeObjectURL(old); return f ? URL.createObjectURL(f) : ""; }); }} /></span>
      </label>
      <Flash msg={msg} />
      <small style={{ opacity: 0.7 }}>Posting as {me.name}. Reviews are checked by a volunteer before they appear.</small>
      <div style={{ textAlign: "center" }}><button className="btn btn-main" disabled={busy}>{busy ? "Sending…" : "Submit review"}</button></div>
    </form>
  );
}
