import type { ReactNode } from "react";
import { levelOf, me } from "@/lib/guard";
import { pagesOf, type Section } from "@/lib/access";
import ReadOnlyBox from "./read-only-box";

// Read-only users see the page but every control inside is disabled. The API refuses their writes regardless; this is just so they aren't tempted.
// The level can differ page by page, so the server works out each page's level and the box picks the one for the page being shown.
export default async function ReadOnly({ section, children }: { section: Section; children: ReactNode }) {
  const m = await me();
  const levels = Object.fromEntries([["", levelOf(m, section) ?? ""], ...pagesOf(section).flatMap((p) => [p.path, ...(p.also ?? [])].map((u) => [u, levelOf(m, section, p.key) ?? ""]))]);
  return <ReadOnlyBox levels={levels}>{children}</ReadOnlyBox>;
}
