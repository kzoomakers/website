import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listBuckets } from "@/lib/sign";
import Buckets from "./buckets";

export const dynamic = "force-dynamic";

export default async function BucketsPage() {
  await gate("signdocs", "/admin/signdocs/buckets");
  if (!getConfig()) redirect("/admin/system");
  return <Buckets initial={await listBuckets()} />;
}
