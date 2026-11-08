"use client";
import { useState } from "react";
import Flash from "./flash";
import { sendUpload } from "@/lib/upload-client";
import { fileTooLarge } from "@/lib/upload-limit";

/** Uploads one image to S3 and returns its /uploads/<key> URL; throws the server's message on failure. */
export async function uploadImage(f: File, avatar = false, email = false): Promise<string> {
  if (fileTooLarge(f)) throw new Error(fileTooLarge(f));
  const fd = new FormData(); fd.set("file", f); if (avatar) fd.set("avatar", "1"); if (email) fd.set("email", "1");
  const r = await sendUpload("/api/webmaster/upload", fd);
  if (!r) throw new Error("Couldn't reach the server. Check your connection and try again.");
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).url;
}

// Puck custom field: text URL plus an upload button that stores the file in S3 and fills in /uploads/<key>.
export function ImageInput({ value, onChange, avatar, email }: { value: string; onChange: (v: string) => void; avatar?: boolean; email?: boolean }) {
  const [msg, setMsg] = useState("");
  const upload = async (f?: File) => {
    if (!f) return;
    setMsg("Uploading…");
    try { onChange(await uploadImage(f, avatar, email)); setMsg(""); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <div>
      {value && <img src={value.startsWith("http") || value.startsWith("/") ? value : "/" + value} alt="" style={{ display: "block", maxHeight: 90, maxWidth: "100%", borderRadius: 6, marginBottom: 6 }} />}
      <input style={{ width: "100%" }} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="/images/… or upload" />
      <input type="file" accept="image/*,.heic,.heif" onChange={(e) => upload(e.target.files?.[0])} />
      {msg === "Uploading…" ? <div>{msg}</div> : <Flash msg={msg} />}
    </div>
  );
}
