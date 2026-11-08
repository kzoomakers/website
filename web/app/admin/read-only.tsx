import type { ReactNode } from "react";
import { levelOf, me, type Section } from "@/lib/guard";

// Read-only users see the page but every control inside is disabled. The API refuses their writes regardless; this is just so they aren't tempted.
export default async function ReadOnly({ section, children }: { section: Section; children: ReactNode }) {
  if (levelOf(await me(), section) !== "read") return <>{children}</>;
  return (
    <>
      <p role="status" className="sub" style={{ background: "var(--acc-bg)", padding: "8px 12px", borderRadius: 8 }}>View only: you can look around, but your account can't change anything here.</p>
      <fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>
    </>
  );
}
