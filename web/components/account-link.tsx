"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

// Site-wide account state in the navbar. Fetched client-side so pages stay cacheable.
export function AccountLink() {
  const [me, setMe] = useState<{ name: string; admin: boolean } | null | undefined>(undefined), [here, setHere] = useState("/");
  useEffect(() => {
    setHere(location.pathname + location.search);
    fetch("/api/blog/auth").then((r) => r.json()).then(setMe, () => setMe(null));
  }, []);
  if (me === undefined) return null;
  const out = async (e: React.MouseEvent) => { e.preventDefault(); await fetch("/api/blog/auth", { method: "DELETE" }); signOut({ callbackUrl: "/" }); };
  return me ? (
    <li className="nav-item dropdown">
      <a className="nav-link dropdown-toggle" href="#!" id="navbarAccount" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">Hi, {me.name.split(" ")[0]} <i className="tf-ion-chevron-down" /></a>
      <ul className="dropdown-menu" aria-labelledby="navbarAccount">
        <li><a className="dropdown-item" href="/members">Members area</a></li>
        <li><a className="dropdown-item" href="/account">My account</a></li>
        {me.admin && <li><a className="dropdown-item" href="/admin">Admin</a></li>}
        <li><a className="dropdown-item" href="#!" onClick={out}>Sign out</a></li>
      </ul>
    </li>
  ) : (
    <li className="nav-item"><a className="nav-link" href={`/login?next=${encodeURIComponent(here)}`}>Sign in</a></li>
  );
}
