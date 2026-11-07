import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Pages from "./pages";

export const dynamic = "force-dynamic";

export default async function Admin() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <Pages />;
}
