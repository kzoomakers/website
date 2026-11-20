import SearchPage from "@/feed/views/search-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams, one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  return <SearchPage q={one("q")} what={one("what")} order={one("order")} page={Number(one("page")) || 1} />;
}
