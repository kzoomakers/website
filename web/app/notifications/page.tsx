import { redirect } from "next/navigation";
import Shell from "../blog/shell";
import { me } from "@/lib/guard";
import Mine from "./mine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phone notifications | Kzoo Makers", robots: { index: false } };

export default async function Notifications() {
  const m = await me();
  if (!m) redirect("/login?next=/notifications");
  return <Shell title="Phone notifications" search={false}>{m.email.includes("@") ? <Mine /> : <p>Sign in with a real account to set up notifications.</p>}</Shell>;
}
