import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publicTemplate } from "@/lib/sign";
import Start from "./start";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign a document | Kzoo Makers", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public "sign this" link from a template: the visitor gives a name and email and gets their own copy to sign.
export default async function PublicSign({ params }: { params: Promise<{ token: string }> }) {
  if (!db()) notFound();
  const t = await publicTemplate((await params).token).catch(() => undefined);
  if (!t) return <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 16px" }}><h1>Link not active</h1><p>This signing link is no longer active. Ask the sender for a new one.</p></main>;
  return <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px", display: "grid", gap: 16 }}><h1>{t.title}</h1><Start token={(await params).token} /></main>;
}
