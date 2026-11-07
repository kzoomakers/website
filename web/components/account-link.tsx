"use client";
import { useEffect, useState } from "react";

// Site-wide account state in the navbar. Fetched client-side so pages stay cacheable.
export function AccountLink() {
  const [me, setMe] = useState<{ name: string } | null | undefined>(undefined), [here, setHere] = useState("/");
  useEffect(() => {
    setHere(location.pathname + location.search);
    fetch("/api/blog/auth").then((r) => r.json()).then(setMe, () => setMe(null));
  }, []);
  if (me === undefined) return null;
  return me ? (
    <li className="nav-item"><span className="nav-link">Hi, {me.name.split(" ")[0]} · <a href="#!" onClick={async (e) => { e.preventDefault(); await fetch("/api/blog/auth", { method: "DELETE" }); location.reload(); }}>Sign out</a></span></li>
  ) : (
    <li className="nav-item"><a className="nav-link" href={`/login?next=${encodeURIComponent(here)}`}>Sign in</a></li>
  );
}
