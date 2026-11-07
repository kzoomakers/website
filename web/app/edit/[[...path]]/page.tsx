import { notFound } from "next/navigation";
import { getPage, slugOf } from "@/lib/store";
import { editingAllowed } from "@/lib/guard";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ path?: string[] }> }) {
  if (!editingAllowed()) notFound();
  const slug = slugOf((await params).path);
  // Unknown slug = creating a new page.
  const data = (await getPage(slug)) ?? { root: { props: { title: slug } }, content: [] };
  return <Editor slug={slug} data={data} />;
}
