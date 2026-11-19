import { notFound, redirect } from "next/navigation";
import { storyForComment } from "@/feed/models/story-page";
import { titlePath } from "@/feed/views/story-list";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await storyForComment(id);
  if (!s) notFound();
  redirect(`${titlePath(s)}#c_${id}`);
}
