import { canSpecial, gate } from "@/lib/guard";
import Rollouts from "./rollouts";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const level = await gate("training", "/admin/people/training/reports");
  const w = level === "write";
  return <Rollouts canRollout={w && (await canSpecial("training.rollout"))} canOverride={w && (await canSpecial("training.override"))} />;
}
