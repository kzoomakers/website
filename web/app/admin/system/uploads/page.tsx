import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import UploadLimit from "../upload-limit";
import { uploadLimits } from "@/lib/upload-cfg";
import { MAX_PUBLIC_MB, MAX_UPLOAD_MB } from "@/lib/upload-limit";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  if ((await gate("system", "/admin/system/uploads")) !== "write") redirect("/admin");
  if (!getConfig()) redirect("/admin/system");
  return <><h1>Upload limits</h1><UploadLimit initial={await uploadLimits(true)} max={MAX_UPLOAD_MB} maxPublic={MAX_PUBLIC_MB} /></>;
}
