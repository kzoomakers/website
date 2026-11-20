import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

// The link in the invitation email: on to the sign-up form, which checks the code and fills in the address. The code is a secret, so it is never echoed into logs or sent on.
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/signup?code=${encodeURIComponent(code.slice(0, 60))}`);
}
