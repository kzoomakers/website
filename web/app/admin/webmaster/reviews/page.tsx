import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listReviews, reviewCounts } from "@/lib/reviews";
import Reviews from "./reviews";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  await gate("webmaster", "/admin/webmaster/reviews");
  if (!getConfig()) redirect("/admin/services");
  const counts = await reviewCounts(), tab = counts.pending ? "pending" : "approved";
  return <Reviews initial={await listReviews(tab)} tab={tab} counts={counts} />;
}
