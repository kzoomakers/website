import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listMedia } from "@/lib/media";
import Library from "./library";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await gate("blog", "/admin/blog/media");
  if (!getConfig()) redirect("/admin/services");
  return <Library initial={await listMedia()} />;
}
