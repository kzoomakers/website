import { notFound, redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getGuided } from "@/lib/store";
import { guidedDef } from "@/lib/guided";
import GuidedEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function GuidedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await editingAllowed())) redirect(`/api/auth/signin?callbackUrl=/webmaster/guided/${slug}`);
  if (!getConfig()) redirect("/webmaster/setup");
  const def = guidedDef(slug);
  const data = await getGuided(slug);
  if (!def || !data) notFound();
  return <GuidedEditor def={def} initial={data} />;
}
