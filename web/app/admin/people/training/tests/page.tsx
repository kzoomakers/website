import { gate } from "@/lib/guard";
import Tests from "./tests";

export const dynamic = "force-dynamic";

export default async function TestsPage() {
  const level = await gate("training", "/admin/people/training/tests");
  return <Tests canEdit={level === "write"} />;
}
