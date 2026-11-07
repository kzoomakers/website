"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

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
