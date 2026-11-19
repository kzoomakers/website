import { LoginPage } from "@/feed/views/auth";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LoginPage q={await searchParams} />;
}
