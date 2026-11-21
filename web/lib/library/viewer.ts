import { hasAny, me } from "../guard";
import { currentMember } from "../readers";
import type { Viewer } from "./rules";

/** The signed-in person's view rights: an approved member, and/or staff (library, courses or training access, or a full admin). */
export async function viewer(): Promise<Viewer> {
  const [u, m] = await Promise.all([currentMember().catch(() => null), me().catch(() => null)]);
  return { id: u?.id ?? null, member: !!u, staff: !!m && (hasAny(m, "library") || hasAny(m, "learning") || hasAny(m, "training")) };
}
