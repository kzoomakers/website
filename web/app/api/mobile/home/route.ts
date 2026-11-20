import { NextResponse } from "next/server";
import { currentMember, currentVerified } from "@/lib/readers";
import { authsFor, conversations, memberships, upcomingClasses } from "@/lib/crm";
import { recentVisits } from "@/lib/guests";

export const dynamic = "force-dynamic";

// The phone app's Home: the same facts as /members, as JSON. Classes are every upcoming class; `mine` says whether the member is in it. Changes go through /api/members (signup, cancel).
export async function GET() {
  const u = await currentMember().catch(() => null);
  if (!u) return (await currentVerified().catch(() => null)) ? new NextResponse("Your membership isn't approved yet.", { status: 403 }) : new NextResponse("Sign in first.", { status: 401 });
  const [levels, auths, classes, convos, visits] = await Promise.all([memberships(u.id), authsFor(u.id), upcomingClasses(u.id), conversations(u.id), recentVisits(u.id).catch(() => [])]);
  return NextResponse.json({ name: u.name, levels, auths, classes, unreadMessages: convos.reduce((n, c) => n + (c.unread || 0), 0), visits });
}
