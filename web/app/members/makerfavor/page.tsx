import MembersShell from "../shell";
import Chores from "./chores";

export const dynamic = "force-dynamic";
export const metadata = { title: "MakerFavor™ | Kzoo Makers", robots: { index: false } };

export default function ChoresPage() {
  return <MembersShell title="MakerFavor™" path="/members/makerfavor">{() => <Chores />}</MembersShell>;
}
