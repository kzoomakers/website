import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { envConfig } from "@/lib/config";
import Form from "./form";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/webmaster/setup");
  if (envConfig()) redirect("/webmaster");
  return <Form />;
}
