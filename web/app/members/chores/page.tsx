import MembersShell from "../shell";
import Chores from "./chores";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer chores | Kzoo Makers", robots: { index: false } };

export default function ChoresPage() {
  return <MembersShell title="Volunteer chores" path="/members/chores">{() => <Chores />}</MembersShell>;
}
