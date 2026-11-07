import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import Pages from "./pages";

export const dynamic = "force-dynamic";

export default async function Admin() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/webmaster");
  if (!getConfig()) redirect("/webmaster/setup");
  return <Pages />;
}
