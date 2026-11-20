import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Page from "./log";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  await gate("makerfavor", "/admin/makerfavor/log");
  if (!getConfig()) redirect("/admin/system");
  return <Page />;
}
