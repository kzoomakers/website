import { gate } from "@/lib/guard";
import PracticeAdmin from "./practice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Practice quizzes | Kzoo Makers admin" };

export default async function PracticePage() {
  const level = await gate("learning", "/admin/learning");
  return <PracticeAdmin canEdit={level === "write"} />;
}
