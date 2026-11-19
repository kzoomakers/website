// The admin sign-in page only returns to paths under /admin, so the same handler is reachable here for admins who still have to sign in.
export { GET } from "@/app/feed-sso/route";
export const dynamic = "force-dynamic";
