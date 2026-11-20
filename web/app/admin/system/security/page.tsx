import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getSecHeaders } from "@/lib/sechead-store";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await gate("system", "/admin/system/security");
  if (!getConfig()) redirect("/admin/system");
  return <Editor initial={await getSecHeaders()} />;
}
