import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const list = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** ADMIN_EMAILS entries are exact addresses, or "@domain.org" to admit a whole domain. */
export const isAdmin = (email?: string | null) => {
  const e = email?.toLowerCase() ?? "";
  return !!e && list().some((a) => (a.startsWith("@") ? e.endsWith(a) : e === a));
};

/** The one rule for who may be a Google admin (web sign-in and the phone app): verified, on the list, and for a "@domain" entry, a Workspace account of that domain. */
export const googleAdminOk = (profile?: { email?: string | null; email_verified?: unknown; hd?: unknown } | null) =>
  !!profile?.email_verified && isAdmin(profile.email) && (list().includes(profile.email!.toLowerCase()) || profile.hd === profile.email!.split("@")[1].toLowerCase());

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/admin-login", error: "/admin-login" },
  callbacks: {
    // Only verified Google accounts on the allow-list can sign in at all.
    // A domain entry also requires Google's hosted-domain claim, so a personal Google account that merely uses a kzoomakers.org address is refused.
    // A string return sends them back to our login page with a friendly message instead of the generic error page.
    signIn: ({ profile }) => (googleAdminOk(profile as any) ? true : "/admin-login?notadmin=1"),
  },
});
