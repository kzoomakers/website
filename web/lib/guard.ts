import { auth, isAdmin } from "@/auth";

// Admin = signed-in Google user on ADMIN_EMAILS. Local `npm run dev` without Google creds is open for convenience.
export async function editingAllowed() {
  if (process.env.NODE_ENV !== "production" && !process.env.AUTH_GOOGLE_ID) return true;
  return isAdmin((await auth())?.user?.email);
}

/** Who is making this change, for the audit log. */
export async function actor() {
  return (await auth())?.user?.email ?? "dev";
}
