import { gate } from "@/lib/guard";
import Editor from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit course | Kzoo Makers admin" };

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const level = await gate("learning", "/admin/learning");
  return <Editor id={Number((await params).id)} canEdit={level === "write"} />;
}
