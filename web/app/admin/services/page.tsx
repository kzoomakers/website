import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { envConfig, getConfig } from "@/lib/config";
import { s3Settings } from "@/lib/s3";
import { sealInfo } from "@/lib/pdf-seal";
import Form from "./form";
import Seal from "./seal";
import UploadLimit from "./upload-limit";
import MembershipClasses from "./membership-classes";
import { membershipClasses } from "@/lib/membership";
import { uploadLimits } from "@/lib/upload-cfg";
import { MAX_PUBLIC_MB, MAX_UPLOAD_MB } from "@/lib/upload-limit";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if ((await gate("admin", "/admin/services")) !== "write") redirect("/admin");
  const env = envConfig(), cfg = getConfig();
  const s3 = cfg ? await s3Settings().catch(() => null) : null;
  return <><Form dbHost={env && URL.canParse(env.databaseUrl) ? new URL(env.databaseUrl).host : undefined} s3={s3 ? { endpoint: s3.endpoint, bucket: s3.bucket, region: s3.region } : undefined} configured={!!cfg} />{cfg && <><UploadLimit initial={await uploadLimits(true)} max={MAX_UPLOAD_MB} maxPublic={MAX_PUBLIC_MB} /><MembershipClasses initial={await membershipClasses()} /><Seal initial={await sealInfo()} /></>}</>;
}
