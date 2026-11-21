import { notFound } from "next/navigation";
import { learnFlags } from "@/lib/learn-flags";
import { viewer } from "@/lib/library/viewer";
import MembersShell from "../../shell";
import Practice from "./practice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Practice | Kzoo Makers", robots: { index: false } };

export default async function PracticePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lesson?: string }> }) {
  const { id } = await params, { lesson } = await searchParams, v = await viewer();
  if (!(await learnFlags()).courses && !v.staff) notFound();
  return <MembersShell title="Practice" path={`/members/practice/${id}`}>{() => <Practice testId={Number(id)} lesson={Number.isInteger(Number(lesson)) && Number(lesson) > 0 ? Number(lesson) : undefined} />}</MembersShell>;
}
