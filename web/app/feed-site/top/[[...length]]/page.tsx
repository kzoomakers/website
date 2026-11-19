import { notFound, redirect } from "next/navigation";
import { timeInterval } from "@/feed/interval";
import { TopPage, splitPage } from "@/feed/views/pages";

export const dynamic = "force-dynamic";

// /top, /top/3d, /top/3d/page/2. A bad length goes to the one-week list, as Lobsters does.
export default async function Page({ params }: { params: Promise<{ length?: string[] }> }) {
  const seg = (await params).length ?? [], { rest, page } = splitPage(seg);
  if (rest.length > 1) notFound();
  const iv = timeInterval(rest[0]);
  if (iv.placeholder && rest[0] !== "1w") redirect("/top/1w");
  return <TopPage length={rest[0]} page={page} />;
}
