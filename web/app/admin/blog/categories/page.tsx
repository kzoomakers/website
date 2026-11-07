import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listCategories } from "@/lib/blog";
import Lookup from "../lookup";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/blog/categories");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <Lookup kind="category" noun="category" initial={await listCategories()} fields={[{ key: "name", label: "Name" }, { key: "slug", label: "URL slug (blank = from name)" }, { key: "description", label: "Description", area: true }]} />;
}
