import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { sealConfigured } from "@/lib/pdf-seal";
import { listBuckets, listDocs, listTags } from "@/lib/sign";
import Papers from "./papers";

export const dynamic = "force-dynamic";

export default async function SignedDocsPage() {
  await gate("board", "/admin/esign");
  if (!getConfig()) redirect("/admin/services");
  return <Papers sealed={await sealConfigured()} initial={await listDocs()} buckets={await listBuckets()} tags={await listTags()} />;
}
