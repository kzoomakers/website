import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import HttpLog from "./httplog";

export const dynamic = "force-dynamic";

export default async function HttpLogPage() {
  await gate("system", "/admin/system/httplog");
  if (!getConfig()) redirect("/admin/system");
  return <HttpLog />;
}
