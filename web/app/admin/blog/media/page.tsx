import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listMedia } from "@/lib/media";
import Library from "./library";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/blog/media");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <Library initial={await listMedia()} />;
}
