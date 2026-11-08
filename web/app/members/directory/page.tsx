import { directoryFacets, mySkills, searchDirectory } from "@/lib/crm";
import MembersShell from "../shell";
import Directory from "./directory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member directory | Kzoo Makers", robots: { index: false } };

export default function DirectoryPage() {
  return (
    <MembersShell title="Member directory" path="/members/directory">
      {async (u) => <Directory initial={await searchDirectory("", "")} facets={await directoryFacets()} listed={(await mySkills(u.id)).optin} />}
    </MembersShell>
  );
}
