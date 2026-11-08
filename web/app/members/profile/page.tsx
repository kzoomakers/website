import { fieldSuggestions, mySkills, skillNames } from "@/lib/crm";
import MembersShell from "../shell";
import Profile from "./profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Profile | Kzoo Makers", robots: { index: false } };

export default function ProfilePage() {
  return (
    <MembersShell title="My Profile" path="/members/profile">
      {async (u) => <Profile init={await mySkills(u.id)} suggestions={await skillNames()} values={await fieldSuggestions()} />}
    </MembersShell>
  );
}
