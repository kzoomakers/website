import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getPrivacy } from "@/lib/store";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function PrivacyAdmin() {
  await gate("system", "/admin/system/privacy");
  if (!getConfig()) redirect("/admin/system");
  return <Editor initial={await getPrivacy()} />;
}
