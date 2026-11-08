import { me } from "@/lib/guard";
import { redirect } from "next/navigation";
import { currentApplicant, safeNext } from "@/lib/readers";
import { getPrivacy } from "@/lib/store";
import LoginScreen from "@/components/login-screen";
import "./login.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in | Kzoo Makers", robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string; denied?: string }> }) {
  const s = await searchParams;
  // Signed in but not approved yet: the only place for them is their Home, which shows the approval status (otherwise every members-only redirect would loop back here).
  const ap = await currentApplicant().catch(() => null);
  if (ap && (ap.approval !== "approved" || ap.onboarding !== "done")) redirect("/members"); // and /members sends approved-but-unfinished people to their next step
  return <LoginScreen next={safeNext(s.next)} expired={!!s.expired} denied={s.denied ? (await me())?.email : undefined} google={!!process.env.AUTH_GOOGLE_ID} privacy={await getPrivacy().catch(() => "")} />;
}
