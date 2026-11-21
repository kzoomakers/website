import { me } from "../guard";
import { currentMember } from "../readers";
import { isStaff, type Viewer } from "./rules";

/** The signed-in person's view rights: an approved member, and/or staff (see isStaff in rules.ts). */
export async function viewer(): Promise<Viewer> {
  const [u, m] = await Promise.all([currentMember().catch(() => null), me().catch(() => null)]);
  return { id: u?.id ?? null, member: !!u, staff: !!m && isStaff(m.perms) };
}
