import { notFound } from "next/navigation";
import { gate } from "@/lib/guard";
import { ENTRIES } from "@/lib/nav-manifest";

export const dynamic = "force-dynamic";

// Placeholder for the Training pages that arrive in later phases (a real page in its own folder takes over from here).
export default async function TrainingSoon({ params }: { params: Promise<{ page?: string[] }> }) {
  const path = ["/admin/people/training", ...((await params).page ?? [])].join("/");
  const e = ENTRIES.find(([, x]) => x.href === path)?.[1];
  if (!e) notFound();
  await gate("training", path);
  return <><h1>{e.label}</h1><p className="sub">Coming soon. Training is being built in stages; switch it on under Training settings when it is ready.</p></>;
}
