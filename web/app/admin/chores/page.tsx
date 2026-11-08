import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listing, members } from "@/lib/chores";
import Todo from "./todo";

export const dynamic = "force-dynamic";

export default async function ChoresPage() {
  await gate("chores", "/admin/chores");
  if (!getConfig()) redirect("/admin/services");
  return <Todo initial={await listing()} members={await members()} />;
}
