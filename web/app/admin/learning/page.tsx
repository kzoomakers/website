import { gate } from "@/lib/guard";
import Courses from "./courses";

export const dynamic = "force-dynamic";
export const metadata = { title: "Courses | Kzoo Makers admin" };

export default async function CoursesPage() {
  const level = await gate("learning", "/admin/learning");
  return <Courses canEdit={level === "write"} />;
}
