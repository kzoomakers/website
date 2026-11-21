import { editingAllowed, gate } from "@/lib/guard";
import ToolsAdmin from "./tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tool learning | Kzoo Makers admin" };

export default async function ToolsPage() {
  const level = await gate("learning", "/admin/learning");
  // Linking a document to a tool changes who may open it, so it also needs library write access.
  return <ToolsAdmin canEdit={level === "write" && (await editingAllowed("library", "write", "documents"))} />;
}
