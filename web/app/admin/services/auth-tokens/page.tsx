import { gate } from "@/lib/guard";
import AuthTokens from "./auth-tokens";

export const dynamic = "force-dynamic";

export default async function AuthTokensPage() {
  return <AuthTokens canEdit={(await gate("admin", "/admin/services/auth-tokens")) === "write"} />;
}
