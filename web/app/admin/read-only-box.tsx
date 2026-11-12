"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** `levels` maps each page's path to the viewer's level there ("" = the whole section). The longest path that is the URL or a parent of it wins. */
export default function ReadOnlyBox({ levels, children }: { levels: Record<string, string>; children: ReactNode }) {
  const here = usePathname() ?? "", hit = Object.keys(levels).filter((p) => p && (here === p || here.startsWith(p + "/"))).sort((a, b) => b.length - a.length)[0];
  if ((hit ? levels[hit] : levels[""]) !== "read") return <>{children}</>;
  return (
    <>
      <p role="status" className="sub" style={{ background: "var(--acc-bg)", padding: "8px 12px", borderRadius: 8 }}>View only: you can look around, but your account can't change anything here.</p>
      <fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>
    </>
  );
}
