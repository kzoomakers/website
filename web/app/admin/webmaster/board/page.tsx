import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { getBoard } from "@/lib/store";
import BoardAdmin from "./editor";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  await gate("webmaster", "/admin/webmaster/board");
  if (!getConfig()) redirect("/admin/services");
  return <BoardAdmin initial={await getBoard()} />;
}
