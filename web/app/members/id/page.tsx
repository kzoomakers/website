import { cookies } from "next/headers";
import { uploadLimitMb } from "@/lib/upload-cfg";
import { ID_KINDS } from "@/lib/onboarding";
import { myCard } from "@/lib/id-card";
import { UNLOCK_COOKIE, hasPassword, idUnlocked } from "@/lib/readers";
import MembersShell from "../shell";
import IdCard from "./id-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "ID | Kzoo Makers", robots: { index: false } };

export default function IdPage() {
  return (
    <MembersShell title="ID" path="/members/id">
      {async (u) => <IdCard card={await myCard(u.id)} unlocked={idUnlocked(u.id, (await cookies()).get(UNLOCK_COOKIE)?.value)} password={await hasPassword(u.id)} kinds={ID_KINDS} mb={await uploadLimitMb()} />}
    </MembersShell>
  );
}
