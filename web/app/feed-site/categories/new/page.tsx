import { CategoryFormPage } from "@/feed/views/tag-pages";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default function Page() { return <CategoryFormPage name={null} />; }
