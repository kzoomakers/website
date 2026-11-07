"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

// Red corner ribbon, top right. Shown inside /webmaster only.
export function WebmasterRibbon() {
  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 150, height: 150, overflow: "hidden", pointerEvents: "none", zIndex: 99999 }}>
      <a href="/webmaster" style={{ position: "absolute", top: 34, right: -44, width: 200, padding: "6px 0", textAlign: "center", transform: "rotate(45deg)", background: "#c00", color: "#fff", font: "700 13px/1.2 sans-serif", letterSpacing: 1.5, textDecoration: "none", boxShadow: "0 2px 6px rgba(0,0,0,.4)", pointerEvents: "auto" }}>WEBMASTER</a>
    </div>
  );
}

// Footer login/logout. Client-side so the static Footer stays usable inside the Puck editor too.
export function AdminLink() {
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = still checking
  useEffect(() => {
    fetch("/api/auth/session").then((r) => r.json()).then((s) => setEmail(s?.user?.email ?? null)).catch(() => setEmail(null));
  }, []);
  if (email === undefined) return null;
  return (
    <h6 style={{ opacity: 0.7 }}>
      {email
        ? <><a href="/webmaster">Admin</a> · <a href="#" onClick={(e) => { e.preventDefault(); signOut({ callbackUrl: "/" }); }}>Log out ({email})</a></>
        : <a href="/api/auth/signin?callbackUrl=/webmaster">Admin login</a>}
    </h6>
  );
}
