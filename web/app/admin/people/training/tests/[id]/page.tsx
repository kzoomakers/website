import { notFound } from "next/navigation";
import { canSpecial, gate } from "@/lib/guard";
import { getTest } from "@/lib/training/tests";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const level = await gate("training", `/admin/people/training/tests/${id}`);
  const t = Number.isInteger(id) ? await getTest(id) : null;
  if (!t) notFound();
  return <Editor initial={JSON.parse(JSON.stringify(t))} canEdit={level === "write"} canPublish={level === "write" && (await canSpecial("training.publish"))} />;
}
