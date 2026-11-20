import FiltersPage from "@/feed/views/filters-page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default function Page() { return <FiltersPage />; }
