"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// Sidebar links: always visible on desktop (display:contents), behind a "Menu" button on phones. Closes on navigation.
export default function Collapse({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false), here = usePathname();
  useEffect(() => setOpen(false), [here]);
  return (
    <>
      <button className="adm-burger" aria-expanded={open} onClick={() => setOpen(!open)}><span aria-hidden>{open ? "✕" : "☰"}</span> Menu</button>
      <div className="adm-links" data-open={open || undefined}>{children}</div>
    </>
  );
}
