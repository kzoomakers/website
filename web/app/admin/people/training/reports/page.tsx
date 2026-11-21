import { canSpecial, gate } from "@/lib/guard";
import More from "./more";
import Regrade from "./regrade";
import Rollouts from "./rollouts";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const level = await gate("training", "/admin/people/training/reports");
  const w = level === "write";
  const canOverride = w && (await canSpecial("training.override"));
  return <><Rollouts canRollout={w && (await canSpecial("training.rollout"))} canOverride={canOverride} /><Regrade canOverride={canOverride} /><More canOverride={canOverride} /></>;
}
