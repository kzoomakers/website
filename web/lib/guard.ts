import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/auth";
import { db } from "./db";
import { currentMember } from "./readers";

// Admin RBAC. Each top-level admin page is a section; a user has no access, "read" (view only) or "write" (view + change) to each.
// "admin" is the Admin page itself (users and access); admin:write is a full admin and implies write everywhere.
export const SECTIONS = ["webmaster", "mail", "blog", "forms", "crm", "board", "tours", "chores", "admin"] as const;
export type Section = (typeof SECTIONS)[number];
export type Level = "read" | "write";
export type Me = { email: string; name: string; image?: string; perms: Partial<Record<Section, Level>> };

const ROOT: Me["perms"] = { admin: "write" };

/** Who is signed in: a Google account on ADMIN_EMAILS (full admin), or a site account with rows in user_perms. Local `npm run dev` with ALLOW_DEV_ADMIN=1 (never in production) is a full admin. */
export const me = cache(async (): Promise<Me | null> => {
  if (process.env.ALLOW_DEV_ADMIN === "1" && process.env.NODE_ENV !== "production") return { email: "dev", name: "dev", perms: ROOT };
  const g = (await auth())?.user;
  if (g?.email && isAdmin(g.email)) return { email: g.email, name: g.name ?? g.email, image: g.image ?? undefined, perms: ROOT };
  const r = await currentMember().catch(() => null);
  const d = db();
  if (!r || !d) return null;
  await d.ready;
  const perms: Me["perms"] = {};
  for (const x of (await d.pool.query("SELECT section, level FROM user_perms WHERE user_id = $1", [r.id])).rows)
    if ((SECTIONS as readonly string[]).includes(x.section)) perms[x.section as Section] = x.level;
  return { email: r.email, name: r.name, perms };
});

export const levelOf = (m: Me | null, s: Section): Level | undefined => (!m ? undefined : m.perms.admin === "write" ? "write" : m.perms[s]);

/** API check: may the caller read (any access) or write this section? */
export async function editingAllowed(section: Section, need: Level = "write") {
  const l = levelOf(await me(), section);
  return need === "read" ? !!l : l === "write";
}

/** Page check: returns the caller's level, or sends them to sign in (or to the "no access" message if already signed in). */
export async function gate(section: Section, path: string): Promise<Level> {
  const m = await me(), l = levelOf(m, section);
  if (!l) redirect(`/admin-login?next=${encodeURIComponent(path)}${m ? "&denied=1" : ""}`);
  return l;
}

/** Who is making this change, for the audit log. */
export async function actor() {
  return (await me())?.email ?? "dev";
}
