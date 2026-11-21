import { gate } from "@/lib/guard";
import Trainers from "./trainers";

export const dynamic = "force-dynamic";

export default async function TrainersPage() {
  const level = await gate("training", "/admin/people/training/trainers");
  return <Trainers canEdit={level === "write"} />;
}
