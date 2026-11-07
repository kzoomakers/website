import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listReviews, reviewCounts } from "@/lib/reviews";
import Reviews from "./reviews";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster/reviews");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  const counts = await reviewCounts(), tab = counts.pending ? "pending" : "approved";
  return <Reviews initial={await listReviews(tab)} tab={tab} counts={counts} />;
}
