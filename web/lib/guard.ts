import { cache } from "react";
import { anyLevel, levelFor, pageOf, SECTIONS, type Level, type Perms, type Section } from "./access";
import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/auth";
import { db } from "./db";
import { currentMember } from "./readers";

// Admin RBAC. Each top-level admin page is a section; a user has no access, "read" (view only) or "write" (view + change) to each.
// "admin" is the Admin page itself (users and access); admin:write is a full admin and implies write everywhere.
export { SECTIONS, type Section, type Level } from "./access";
export type Me = { email: string; name: string; image?: string; perms: Perms };

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
    if ((SECTIONS as readonly string[]).includes(x.section.split(":")[0])) perms[x.section] = x.level; // "tours" or "tours:walkups"
  return { email: r.email, name: r.name, perms };
});

/** Level for a section, or for one page of it (see lib/access.ts). Without a page only a whole-section grant counts. */
export const levelOf = (m: Me | null, s: Section, page?: string | string[]): Level | undefined => (!m ? undefined : levelFor(m.perms, s, page));
/** Any access inside the section, whole or one page: for tabs and alerts, never for deciding what someone may change. */
export const hasAny = (m: Me | null, s: Section) => !!m && !!anyLevel(m.perms, s);

/** API check: may the caller read (any access) or write? Name the page(s) of the section this endpoint serves so a person given just those pages can use it; with none named, only a whole-section grant passes. */
export async function editingAllowed(section: Section, need: Level = "write", page?: string | string[]) {
  const l = levelOf(await me(), section, page);
  return need === "read" ? !!l : l === "write";
}

/** Page check: returns the caller's level for the page this URL is, or sends them to sign in (or to the "no access" message if already signed in). */
export async function gate(section: Section, path: string): Promise<Level> {
  const m = await me(), pg = pageOf(path), l = levelOf(m, section, pg?.section === section ? pg.key : undefined);
  if (!l) redirect(`/admin-login?next=${encodeURIComponent(path)}${m ? "&denied=1" : ""}`);
  return l;
}

/** Who is making this change, for the audit log. */
export async function actor() {
  return (await me())?.email ?? "dev";
}

/** May the caller do this special thing (publish an agreement)? Anyone on the list for it; with an empty list, any full administrator. Set the lists at Admin > Access > Special permissions. */
export async function canSpecial(perm: "agreement.member" | "agreement.guest") {
  const m = await me();
  if (!m) return false;
  const d = db();
  if (!d) return levelOf(m, "admin") === "write";
  await d.ready;
  const list = (await d.pool.query("SELECT email FROM special_perms WHERE perm = $1", [perm])).rows.map((r) => String(r.email).toLowerCase());
  return list.length ? list.includes(m.email.toLowerCase()) : levelOf(m, "admin") === "write";
}

/** A hard-coded site admin (ADMIN_EMAILS, signed in with Google), not just someone granted a section. Some data, like who clicked which link in an email, is for these people only. */
export async function siteAdmin() {
  if (process.env.ALLOW_DEV_ADMIN === "1" && process.env.NODE_ENV !== "production") return true;
  const e = (await auth())?.user?.email;
  return !!e && isAdmin(e);
}
