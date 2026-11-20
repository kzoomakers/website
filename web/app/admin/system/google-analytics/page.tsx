import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { adminView } from "@/lib/ga";
import GoogleAnalytics from "./google-analytics";

export const dynamic = "force-dynamic";

export default async function GoogleAnalyticsPage() {
  const level = await gate("system", "/admin/system/google-analytics");
  if (!getConfig()) redirect("/admin/system");
  return <GoogleAnalytics initial={await adminView()} canEdit={level === "write"} />;
}
