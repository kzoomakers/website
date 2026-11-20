import { notFound } from "next/navigation";
import { trainingEnabled } from "@/lib/training/settings";
import MembersShell from "../../../shell";
import Taker from "./taker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training test | Kzoo Makers", robots: { index: false } };

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await trainingEnabled())) notFound();
  return <MembersShell title="Training test" path={`/members/training/test/${id}`}>{() => <Taker testId={id} />}</MembersShell>;
}
