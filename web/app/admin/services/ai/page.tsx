import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { adminView } from "@/lib/ai";
import Ai from "./ai";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const level = await gate("admin", "/admin/services/ai");
  if (!getConfig()) redirect("/admin/services");
  return <Ai initial={await adminView()} canEdit={level === "write"} />;
}
