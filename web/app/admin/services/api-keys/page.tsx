import { gate } from "@/lib/guard";
import ApiKeys from "../../users/api-keys";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  return <ApiKeys canEdit={(await gate("admin", "/admin/services/api-keys")) === "write"} />;
}
