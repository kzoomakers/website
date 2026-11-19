import { notFound } from "next/navigation";
import { findProfile } from "@/feed/models/users";
import UserPage from "@/feed/views/user-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const u = await findProfile(decodeURIComponent((await params).username));
  if (!u) notFound();
  return <UserPage u={u} />;
}
