import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getBoard } from "@/lib/store";
import BoardAdmin from "./editor";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster/board");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  return <BoardAdmin initial={await getBoard()} />;
}
