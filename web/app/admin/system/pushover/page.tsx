import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { adminView, recent } from "@/lib/pushover";
import Pushover from "./pushover";

export const dynamic = "force-dynamic";

export default async function PushoverPage() {
  await gate("system", "/admin/system/pushover");
  if (!getConfig()) redirect("/admin/system");
  return <Pushover initial={await adminView()} log={JSON.parse(JSON.stringify(await recent()))} />;
}
