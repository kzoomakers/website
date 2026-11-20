import { gate } from "@/lib/guard";
import { trainingEnabled } from "@/lib/training/settings";
import Settings from "./settings";

export const dynamic = "force-dynamic";

export default async function TrainingSettingsPage() {
  const level = await gate("training", "/admin/people/training/settings");
  return <Settings enabled={await trainingEnabled()} canEdit={level === "write"} />;
}
