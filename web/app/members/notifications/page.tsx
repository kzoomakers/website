import Mine from "@/app/notifications/mine";
import MembersShell from "../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phone notifications | Kzoo Makers", robots: { index: false } };

export default function MemberNotifications() {
  return <MembersShell title="Phone notifications" path="/members/notifications">{() => <Mine />}</MembersShell>;
}
