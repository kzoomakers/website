import { gate } from "@/lib/guard";
import ToolsAdmin from "./tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tool learning | Kzoo Makers admin" };

export default async function ToolsPage() {
  const level = await gate("learning", "/admin/learning");
  return <ToolsAdmin canEdit={level === "write"} />;
}
