import { me } from "@/lib/guard";
import { redirect } from "next/navigation";
import { adminNext } from "@/lib/admin-next";
import { getPrivacy } from "@/lib/store";
import LoginScreen from "@/components/login-screen";
import "../login/login.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign in | Kzoo Makers", robots: { index: false } };

// Admin entry: Google or a site account with admin access. Always lands in /admin (a deep link under /admin is kept).
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string; notadmin?: string }> }) {
  const s = await searchParams, next = adminNext(s.next);
  const m = await me().catch(() => null);
  if (m && !s.denied) redirect(next);
  return <LoginScreen admin next={next} expired={false} notAdmin={!!s.notadmin} denied={s.denied ? m?.email : undefined} google={!!process.env.AUTH_GOOGLE_ID} privacy={await getPrivacy().catch(() => "")} />;
}
