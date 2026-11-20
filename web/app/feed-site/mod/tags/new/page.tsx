import { TagFormPage } from "@/feed/views/tag-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default function Page() { return <TagFormPage name={null} />; }
