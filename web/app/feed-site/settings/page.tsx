import SettingsPage from "@/feed/views/settings-page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default function Page() { return <SettingsPage />; }
