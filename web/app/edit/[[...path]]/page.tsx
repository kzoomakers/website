import { notFound } from "next/navigation";
import { LOCKED, getMenu, getPage, slugOf } from "@/lib/store";
import { editingAllowed } from "@/lib/guard";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ path?: string[] }> }) {
  if (!await editingAllowed("webmaster", "write", "pages")) notFound();
  const slug = slugOf((await params).path);
  if (LOCKED.includes(slug)) notFound();
  // Unknown slug = creating a new page.
  const data = (await getPage(slug)) ?? { root: { props: { title: slug } }, content: [] };
  return <Editor slug={slug} data={data} menu={await getMenu()} />;
}
