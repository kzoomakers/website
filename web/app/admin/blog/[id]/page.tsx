import { notFound, redirect } from "next/navigation";
import { actor, gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getPost, listAuthors, listCategories, authorForEmail } from "@/lib/blog";
import PostEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await gate("blog", "/admin/blog/" + id);
  if (!getConfig()) redirect("/admin/services");
  const post = id === "new" ? null : await getPost(Number(id) || 0, true);
  if (id !== "new" && !post) notFound();
  return <PostEditor initial={post} authors={await listAuthors()} categories={await listCategories()} me={(await authorForEmail(await actor())).id} />;
}
