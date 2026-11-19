"use client";
import { useEffect, useRef, useState } from "react";
import { sendUpload } from "@/lib/upload-client";
import { fileTooLarge } from "@/lib/upload-limit";

type Kind = { key: "avatar" | "photo"; tab: string; title: string; api: string; blurb: string; where: string };
const KINDS: Kind[] = [
  { key: "avatar", tab: "Avatar", title: "Avatar picture", api: "/api/account/avatar", where: "Your chats", blurb: "The small round picture next to your messages and in your conversation list. Anything you like: a selfie, a logo, your cat." },
  { key: "photo", tab: "Directory photo", title: "Directory photo", api: "/api/members/photo", where: "Member directory", blurb: "The photo on your directory card (“Introduce yourself”), only for signed-in members who are listed too. A friendly face helps people recognize you at the space." },
];

const CSS = `
.pt-tabs{display:flex;gap:4px;border-bottom:2px solid #e3e6e9;margin:0 0 16px}
.pt-tabs button{flex:1;min-height:44px;padding:8px 10px;border:0;background:none;font:inherit;font-weight:600;color:#626c76;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px}
.pt-tabs button[aria-selected=true]{color:#04331c;border-bottom-color:#01e777}
.pt-box{display:grid;gap:14px;justify-items:center;text-align:center}
.pt-pic{width:140px;height:140px;border-radius:50%;object-fit:cover;background:#e3e6e9;display:grid;place-items:center;font-size:48px;color:#8a8f94;border:3px solid #fff;box-shadow:0 0 0 1px #d4d8dc}
.pt-btns{display:grid;gap:8px;width:100%;max-width:340px}
.pt-btns .btn{width:100%;min-height:46px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-sizing:border-box}
.pt-cam{width:100%;max-width:340px;display:grid;gap:8px}
.pt-cam video{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;background:#000;transform:scaleX(-1)}
@media(min-width:560px){.pt-box{grid-template-columns:auto 1fr;justify-items:start;text-align:left;align-items:center;gap:22px}.pt-btns{max-width:260px}}
`;

/** Own picture editor: tabs for the chat avatar and the directory photo. Take a picture (phone camera or computer webcam) or upload one. */
export default function PhotoTabs({ avatar, photo }: { avatar: string; photo: string }) {
  const [tab, setTab] = useState<Kind["key"]>("avatar"), [urls, setUrls] = useState({ avatar, photo }), [msg, setMsg] = useState(""), [cam, setCam] = useState<MediaStream | null>(null);
  const k = KINDS.find((x) => x.key === tab)!, url = urls[tab];
  const vid = useRef<HTMLVideoElement>(null), snap = useRef<HTMLInputElement>(null);
  useEffect(() => { if (vid.current) vid.current.srcObject = cam; return () => cam?.getTracks().forEach((t) => t.stop()); }, [cam]);
  useEffect(() => { setCam(null); setMsg(""); }, [tab]);

  const upload = async (f?: File) => {
    if (!f) return;
    const big = fileTooLarge(f); if (big) return setMsg(big);
    setMsg("Uploading…"); setCam(null);
    const fd = new FormData(); fd.set("file", f);
    const r = await sendUpload(k.api, fd);
    if (r?.ok) { const { url: n } = await r.json(); setUrls((u) => ({ ...u, [tab]: n })); setMsg("Saved."); } else setMsg(r ? await r.text() : "Network error. Try again.");
  };
  const drop = async () => { const r = await fetch(k.api, { method: "DELETE" }).catch(() => null); if (r?.ok) { setUrls((u) => ({ ...u, [tab]: "" })); setMsg("Removed."); } else setMsg("Couldn't remove it. Try again."); };
  // Phones: the camera app via capture. Computers: an in-page webcam preview (a file input would only open the file picker).
  const take = async () => {
    if (matchMedia("(pointer: coarse)").matches || !navigator.mediaDevices?.getUserMedia) return snap.current?.click();
    setMsg("");
    try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 960 } } })); }
    catch { setMsg("Couldn't use the camera. Allow camera access in your browser, or upload a picture instead."); }
  };
  const shoot = () => {
    const v = vid.current; if (!v?.videoWidth) return;
    const s = Math.min(v.videoWidth, v.videoHeight), c = document.createElement("canvas"); c.width = c.height = Math.min(s, 720);
    c.getContext("2d")!.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, c.width, c.height);
    c.toBlob((b) => b && upload(new File([b], "me.jpg", { type: "image/jpeg" })), "image/jpeg", 0.9);
  };

  return (
    <section aria-label="Your pictures" className="card" style={{ margin: 0 }}>
      <style>{CSS}</style>
      <div className="pt-tabs" role="tablist">
        {KINDS.map((x) => <button key={x.key} type="button" role="tab" id={"pt-" + x.key} aria-selected={tab === x.key} aria-controls="pt-panel" onClick={() => setTab(x.key)}>{x.tab}</button>)}
      </div>
      <div id="pt-panel" role="tabpanel" aria-labelledby={"pt-" + tab} className="pt-box">
        {url ? <img className="pt-pic" src={url} alt={`Your ${k.title.toLowerCase()}`} /> : <span className="pt-pic" aria-hidden>📷</span>}
        <div style={{ display: "grid", gap: 12, justifyItems: "inherit", width: "100%" }}>
          <div><h3 style={{ margin: "0 0 4px" }}>{k.title}</h3><p style={{ margin: 0 }}>{k.blurb}</p><p className="sub" style={{ margin: "6px 0 0" }}>Shown in: <strong>{k.where}</strong>. {tab === "avatar" ? "It's separate from your directory photo." : "It's separate from your chat avatar."}</p></div>
          {cam ? (
            <div className="pt-cam"><video ref={vid} autoPlay playsInline muted aria-label="Camera preview" />
              <button type="button" className="btn btn-main" onClick={shoot}>Take the picture</button><button type="button" className="btn" onClick={() => setCam(null)}>Cancel</button></div>
          ) : (
            <div className="pt-btns">
              <button type="button" className="btn btn-main" onClick={take}>📸 Take a photo</button>
              <label className="btn">⬆️ {url ? "Upload a different one" : "Upload a picture"}<input type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
              {url && <button type="button" className="btn" onClick={drop}>Remove</button>}
              <input ref={snap} type="file" accept="image/*" capture="user" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          )}
          <p role="status" aria-live="polite" style={{ margin: 0, minHeight: "1.4em", color: /^(Saved|Removed|Uploading)/.test(msg) || !msg ? "#626c76" : "#b00020" }}>{msg}</p>
        </div>
      </div>
    </section>
  );
}
