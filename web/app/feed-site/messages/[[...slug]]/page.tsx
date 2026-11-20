import { notFound } from "next/navigation";
import { MessageShow, MessagesIndex } from "@/feed/views/messages-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug?: string[] }>; searchParams: Promise<{ to?: string }> }) {
  const s = (await params).slug ?? [];
  if (!s.length) return <MessagesIndex dir="in" to={(await searchParams).to?.slice(0, 50)} />; // /messages?to=name opens the compose form for that user
  if (s.length === 1 && s[0] === "sent") return <MessagesIndex dir="out" />;
  if (s.length === 1 && /^[a-z0-9]{1,30}$/.test(s[0])) return <MessageShow id={s[0]} />;
  notFound();
}
