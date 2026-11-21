import { gate } from "@/lib/guard";
import File from "./file";

export const dynamic = "force-dynamic";

export default async function CertPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await gate("training", `/admin/people/training/cert/${id}`);
  return <File id={id} />;
}
