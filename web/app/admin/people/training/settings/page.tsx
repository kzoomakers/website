import { gate } from "@/lib/guard";
import { canSpecial } from "@/lib/guard";
import { discordView, recentSends } from "@/lib/training/discord";
import { trainingCfg } from "@/lib/training/settings";
import Settings from "./settings";

export const dynamic = "force-dynamic";

export default async function TrainingSettingsPage() {
  const level = await gate("training", "/admin/people/training/settings");
  const dc = (await canSpecial("training.discord")) ? { cfg: await discordView(), sends: await recentSends() } : null;
  return <Settings cfg={await trainingCfg()} canEdit={level === "write"} discord={dc} />;
}
