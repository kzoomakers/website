export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { levelOf, me } from "@/lib/guard";
import { TABS } from "./tabs";

// Sends people to the landing page (the top bar leads on to the sections they can open).
export default async function Admin() {
  const m = await me();
  const any = TABS.some(([, , , s]) => levelOf(m, s));
  redirect(any ? "/admin/landing" : "/login?next=/admin" + (m ? "&denied=1" : ""));
}
