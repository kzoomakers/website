import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import MailAdmin from "../mail-admin";

export const dynamic = "force-dynamic";

export default async function MailAdminPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug ?? [];
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/mailadmin/" + slug.join("/"));
  if (!getConfig()) redirect("/webmaster/setup");
  return <MailAdmin slug={slug} />;
}
