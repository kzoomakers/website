import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Debug from "./debug";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const level = await gate("system", "/admin/system/debug");
  if (!getConfig()) redirect("/admin/system");
  return <Debug canEdit={level === "write"} />;
}
