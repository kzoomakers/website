import { gate } from "@/lib/guard";
import Queue from "./queue";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  await gate("training", "/admin/people/training");
  return <Queue />;
}
