import UsersPage from "@/feed/views/users-page";

export const dynamic = "force-dynamic";

export default function Page() { return <UsersPage which="moderators" />; }
