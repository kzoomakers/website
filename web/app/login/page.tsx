import { me } from "@/lib/guard";
import { safeNext } from "@/lib/readers";
import LoginScreen from "@/components/login-screen";
import "./login.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in | Kzoo Makers", robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string; denied?: string }> }) {
  const s = await searchParams;
  return <LoginScreen next={safeNext(s.next)} expired={!!s.expired} denied={s.denied ? (await me())?.email : undefined} google={!!process.env.AUTH_GOOGLE_ID} />;
}
