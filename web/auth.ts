import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const list = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** ADMIN_EMAILS entries are exact addresses, or "@domain.org" to admit a whole domain. */
export const isAdmin = (email?: string | null) => {
  const e = email?.toLowerCase() ?? "";
  return !!e && list().some((a) => (a.startsWith("@") ? e.endsWith(a) : e === a));
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/admin-login", error: "/admin-login" },
  callbacks: {
    // Only verified Google accounts on the allow-list can sign in at all.
    // A domain entry also requires Google's hosted-domain claim, so a personal Google account that merely uses a kzoomakers.org address is refused.
    signIn: ({ profile }) => {
      // A string return sends them back to our login page with a friendly message instead of the generic error page.
      const no = "/admin-login?notadmin=1";
      if (!profile?.email_verified || !isAdmin(profile.email)) return no;
      const exact = list().includes(profile.email!.toLowerCase());
      if (!exact && (profile as any).hd !== profile.email!.split("@")[1].toLowerCase()) return no;
      // Domain admins can't be listed up front, so their personal ntfy topic is made when they sign in (best effort, never blocks login).
      import("@/lib/ntfy").then((n) => n.ensureUserTopic(profile.email!)).catch(() => {});
      return true;
    },
  },
});
