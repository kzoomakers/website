import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import MailAdmin from "../mail-admin";

export const dynamic = "force-dynamic";

export default async function MailAdminPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug ?? [];
  await gate("email", "/admin/email/" + slug.join("/"));
  if (!getConfig()) redirect("/admin/system");
  return <MailAdmin slug={slug} />;
}
