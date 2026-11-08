import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listAuthors } from "@/lib/blog";
import Lookup from "../lookup";

export const dynamic = "force-dynamic";

export default async function Page() {
  await gate("blog", "/admin/blog/authors");
  if (!getConfig()) redirect("/admin/services");
  return <Lookup kind="author" noun="author" initial={await listAuthors()} fields={[{ key: "name", label: "Name" }, { key: "email", label: "Email (matches the admin sign-in, so their posts are credited)" }, { key: "bio", label: "Bio", area: true }, { key: "image", label: "Photo", image: true }]} />;
}
