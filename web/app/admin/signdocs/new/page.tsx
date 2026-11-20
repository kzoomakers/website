import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listBuckets, listTemplates } from "@/lib/sign";
import NewPaper from "./new-paper";

export const dynamic = "force-dynamic";

export default async function NewPage() {
  await gate("signdocs", "/admin/signdocs/new");
  if (!getConfig()) redirect("/admin/system");
  return <NewPaper buckets={await listBuckets()} templates={await listTemplates()} />;
}
