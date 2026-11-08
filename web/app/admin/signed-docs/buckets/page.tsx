import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listBuckets } from "@/lib/sign";
import Buckets from "./buckets";

export const dynamic = "force-dynamic";

export default async function BucketsPage() {
  await gate("board", "/admin/signed-docs/buckets");
  if (!getConfig()) redirect("/admin/services");
  return <Buckets initial={await listBuckets()} />;
}
