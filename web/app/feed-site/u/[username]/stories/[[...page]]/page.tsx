import { notFound } from "next/navigation";
import { splitPage, UserStoriesPage } from "@/feed/views/pages";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ username: string; page?: string[] }> }) {
  const { username, page } = await params, p = splitPage(page);
  if (p.rest.length) notFound();
  return <UserStoriesPage username={username} page={p.page} />;
}
