import { gate } from "@/lib/guard";
import ApiKeys from "../access/api-keys";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  return <ApiKeys canEdit={(await gate("system", "/admin/system/api-keys")) === "write"} />;
}
