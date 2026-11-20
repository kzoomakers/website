import UsersPage from "@/feed/views/users-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <UsersPage which={(await searchParams).by === "karma" ? "karma" : "tree"} />;
}
