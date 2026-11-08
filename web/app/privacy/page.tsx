import Shell from "../blog/shell";
import PrivacyText from "@/components/privacy-text";
import { getPrivacy } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy | Kzoo Makers", description: "What Kzoo Makers collects, why, and your choices." };

export default async function PrivacyPage() {
  return <Shell title="Privacy statement" search={false}><PrivacyText text={await getPrivacy()} /></Shell>;
}
