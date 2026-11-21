import { gate } from "@/lib/guard";
import Triage from "./triage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Triage drafts | Kzoo Makers admin" };

export default async function TriagePage() {
  await gate("library", "/admin/library");
  return <Triage />;
}
