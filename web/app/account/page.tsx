import { redirect } from "next/navigation";
import { currentApplicant, safeNext } from "@/lib/readers";
import { getProfile, listContacts, RELATIONSHIPS } from "@/lib/profiles";
import Profile from "./profile";
import Waivers from "./waivers";
import PhotoTabs from "@/components/photo-tabs";
import { conn } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account | Kzoo Makers", robots: { index: false } };

export default async function Account({ searchParams }: { searchParams: Promise<{ setup?: string; next?: string; reset?: string }> }) {
  const s = await searchParams, u = await currentApplicant().catch(() => null);
  if (!u) redirect("/login?next=/account");
  if (u.approval === "rejected") redirect("/members"); // their Home shows the decision; the account APIs refuse them
  const [profile, contacts] = await Promise.all([getProfile(u.id), listContacts(u.id)]);
  const pics = u.approval === "approved" ? (await (await conn()).query("SELECT avatar, photo FROM site_users WHERE id = $1", [u.id])).rows[0] : null;
  return <><h1>My account</h1>{pics && <div style={{ maxWidth: 520, margin: "0 0 36px" }}><PhotoTabs avatar={pics.avatar} photo={pics.photo} /></div>}<Profile profile={profile!} contacts={contacts} relationships={[...RELATIONSHIPS]} next={safeNext(s.next)} setup={!!s.setup} reset={!!s.reset} /><Waivers userId={u.id} /></>;
}
