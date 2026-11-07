import { redirect } from "next/navigation";

// Old location; links already emailed or bookmarked still work.
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  redirect("/login?" + new URLSearchParams(await searchParams));
}
