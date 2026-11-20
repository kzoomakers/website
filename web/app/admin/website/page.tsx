import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Pages from "./pages";

export const dynamic = "force-dynamic";

export default async function Admin() {
  await gate("website", "/admin/website");
  if (!getConfig()) redirect("/admin/system");
  return <Pages />;
}
