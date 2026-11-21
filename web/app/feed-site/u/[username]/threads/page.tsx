import UserThreadsPage from "@/feed/views/threads-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  return <UserThreadsPage username={(await params).username} />;
}
