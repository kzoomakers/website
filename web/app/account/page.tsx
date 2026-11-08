import { redirect } from "next/navigation";
import { currentReader, safeNext } from "@/lib/readers";
import { getProfile, listContacts, RELATIONSHIPS } from "@/lib/profiles";
import Profile from "./profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account | Kzoo Makers", robots: { index: false } };

export default async function Account({ searchParams }: { searchParams: Promise<{ setup?: string; next?: string; reset?: string }> }) {
  const s = await searchParams, u = await currentReader().catch(() => null);
  if (!u) redirect("/login?next=/account");
  const [profile, contacts] = await Promise.all([getProfile(u.id), listContacts(u.id)]);
  return <><h1>Your account</h1><p><a href="/notifications">Set up phone notifications</a></p><Profile profile={profile!} contacts={contacts} relationships={[...RELATIONSHIPS]} next={safeNext(s.next)} setup={!!s.setup} reset={!!s.reset} /></>;
}
