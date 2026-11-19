import { notFound } from "next/navigation";
import { splitPage, OriginPage } from "@/feed/views/pages";

export const dynamic = "force-dynamic";

// an origin identifier has slashes (github.com/user), so the catch-all is the identifier and an optional trailing /page/N
export default async function Page({ params }: { params: Promise<{ id: string[] }> }) {
  const { rest, page } = splitPage((await params).id);
  if (!rest.length) notFound();
  return <OriginPage identifier={rest.join("/")} page={page} />;
}
