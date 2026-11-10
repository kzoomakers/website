import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getGuest, guestOfLink } from "@/lib/guests";
import Delete from "./delete";
import "../../../admin/webmaster/webmaster.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delete my profile | Kzoo Makers", robots: { index: false, follow: false }, referrer: "no-referrer" };

// The "I want to delete my profile" link from the guest agreement update email. Nothing happens until the button is pressed.
export default async function DeletePage({ params }: { params: Promise<{ token: string }> }) {
  if (!db()) notFound();
  const token = (await params).token, id = await guestOfLink(token).catch(() => null), g = id ? await getGuest(id) : null;
  return <div className="adm" style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--ink)", display: "grid", placeItems: "center", padding: 16 }}>
    {g ? <Delete token={token} /> : <main className="card" style={{ maxWidth: 520 }}><h1>This link has expired</h1><p>If you want your profile deleted, reply to the email or write to contact@kzoomakers.org.</p></main>}
  </div>;
}
