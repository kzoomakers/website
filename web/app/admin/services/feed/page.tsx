import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getFeedConfig } from "@/feed/config";
import FeedAdmin from "./feed";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const level = await gate("admin", "/admin/services/feed");
  if (!getConfig()) redirect("/admin/services");
  return <FeedAdmin initial={await getFeedConfig()} canWrite={level === "write"} />;
}
