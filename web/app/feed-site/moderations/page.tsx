import { notFound } from "next/navigation";
import ModerationsPage from "@/feed/views/moderations-page";
import { WHAT, type What } from "@/feed/models/moderations";

export const dynamic = "force-dynamic";

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// ?moderator=(All)&what[stories]=stories&page=2 (moderations_controller). Rails' what[x] arrives from Next as a flat "what[x]" key.
export default async function Page({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams, pg = one(q.page) ?? "1", page = Number(pg);
  if (!/^\d+$/.test(pg) || page > 2 ** 32) notFound();
  const what = WHAT.filter((w) => one(q[`what[${w}]`]) === w) as What[];
  return <ModerationsPage moderator={(one(q.moderator) ?? "(All)").slice(0, 100)} what={what.length === WHAT.length ? [] : what} page={Math.max(page, 1)} />;
}
