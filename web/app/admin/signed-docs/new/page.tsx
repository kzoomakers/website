import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listBuckets, listTemplates } from "@/lib/sign";
import NewPaper from "./new-paper";

export const dynamic = "force-dynamic";

export default async function NewPage() {
  await gate("board", "/admin/signed-docs/new");
  if (!getConfig()) redirect("/admin/services");
  return <NewPaper buckets={await listBuckets()} templates={await listTemplates()} />;
}
