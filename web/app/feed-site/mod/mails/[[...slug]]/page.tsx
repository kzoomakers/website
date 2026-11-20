import { notFound } from "next/navigation";
import { ModMailForm, ModMailIndex, ModMailShow } from "@/feed/views/mod-mail-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const s = (await params).slug ?? [], id = /^[a-z0-9]{1,10}$/;
  if (!s.length) return <ModMailIndex mod />;
  if (s.length === 1 && s[0] === "new") return <ModMailForm />;
  if (s.length === 1 && id.test(s[0])) return <ModMailShow mod id={s[0]} />;
  if (s.length === 2 && s[1] === "edit" && id.test(s[0])) return <ModMailForm id={s[0]} />;
  notFound();
}
