import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { me } from "@/lib/guard";
import { mayAudit } from "@/lib/pii";
import Pii from "./pii";

export const dynamic = "force-dynamic";

// Full administrators, and anyone on the "Audit PII" special list (Admin > Access > Special permissions).
export default async function PiiPage() {
  if (!(await mayAudit())) redirect(`/admin-login?next=${encodeURIComponent("/admin/system/pii")}${(await me()) ? "&denied=1" : ""}`);
  if (!getConfig()) redirect("/admin/system");
  return <Pii full={(await me())?.perms.system === "write"} />;
}
