import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentMember, type Reader } from "@/lib/readers";

/** Sends signed-out visitors to sign in, then renders the page title and body with the reader. The chrome is in layout.tsx. */
export default async function MembersShell({ title, path, children }: { title: string; path: string; children: (u: Reader) => Promise<ReactNode> | ReactNode }) {
  const u = await currentMember().catch(() => null);
  if (!u) redirect("/login?next=" + encodeURIComponent(path));
  return (
    <>
      <h1>{title}</h1>
      {await children(u)}
    </>
  );
}
