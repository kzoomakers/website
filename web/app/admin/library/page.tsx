import { gate } from "@/lib/guard";
import Library from "./library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library | Kzoo Makers admin" };

export default async function LibraryPage() {
  const level = await gate("library", "/admin/library");
  return <Library canEdit={level === "write"} />;
}
