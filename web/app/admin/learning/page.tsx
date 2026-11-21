import { gate } from "@/lib/guard";

export const dynamic = "force-dynamic";

// Placeholder until P3 builds the course editor; the page exists so access can be granted ahead of launch.
export default async function CoursesPage() {
  await gate("learning", "/admin/learning");
  return <><h1>Courses</h1><p className="sub">The course editor arrives in a later phase.</p></>;
}
