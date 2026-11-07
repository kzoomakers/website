import { safeNext } from "@/lib/readers";
import Shell from "../blog/shell";
import { LoginForm } from "../blog/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in | Kzoo Makers", robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const s = await searchParams;
  return <Shell title="Sign in or register" search={false}><LoginForm next={safeNext(s.next)} expired={!!s.expired} /></Shell>;
}
