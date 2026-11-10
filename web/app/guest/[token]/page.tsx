import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getGuest, guestOfLink } from "@/lib/guests";
import GuestPage from "./guest-page";
import "../../admin/webmaster/webmaster.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guest form | Kzoo Makers", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public; the private link in the QR code (or in the update email) is the credential. It only ever opens this one guest's form, and expires.
export default async function Guest({ params }: { params: Promise<{ token: string }> }) {
  if (!db()) notFound();
  const token = (await params).token, id = await guestOfLink(token).catch(() => null), g = id ? await getGuest(id) : null;
  return <div className="adm" style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--ink)", display: "grid", placeItems: "center", padding: 16 }}>
    {g ? <GuestPage token={token} name={g.first_name} host={g.host_name.split(" ")[0]} /> : <main className="card" style={{ maxWidth: 520 }}><h1>This link has expired</h1><p>Ask the member who brought you for a new QR code. Anything you already entered is saved.</p></main>}
  </div>;
}
