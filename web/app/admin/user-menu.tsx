"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";

// Signed-in Google account (photo, name) at the bottom of the sidebar; click for the email and Log out.
export default function UserMenu({ name, email, image, limited }: { name: string; email: string; image?: string; limited?: boolean }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const pic = image && !broken
    ? <img src={image} alt="" width={32} height={32} referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ borderRadius: "50%", flex: "none" }} />
    : <span aria-hidden style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--acc)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flex: "none" }}>{(name || email)[0]?.toUpperCase()}</span>;
  return (
    <div style={{ position: "relative" }}>
      {open && (
        <div id="um-pop" onKeyDown={(e) => e.key === "Escape" && setOpen(false)} style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 6, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.12)", padding: 12 }}>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 12, opacity: 0.7, wordBreak: "break-all", marginBottom: 10 }}>{email}</div>
          {!limited && <a href="/members/notifications" style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Phone alerts</a>}
          <a href="/members" style={{ display: "block", marginBottom: 8, fontSize: 13 }}>My member area</a>
          <a href="/account" style={{ display: "block", marginBottom: 8, fontSize: 13 }}>My account</a>
          <button style={{ width: "100%" }} onClick={() => fetch("/api/blog/auth", { method: "DELETE" }).then(() => signOut({ callbackUrl: "/" }))}>Log out</button>
        </div>
      )}
      <button className="adm-link" aria-expanded={open} aria-controls="um-pop" onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: 0, font: "inherit", cursor: "pointer", textAlign: "left" }}>
        {pic}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || email}</span>
      </button>
    </div>
  );
}
