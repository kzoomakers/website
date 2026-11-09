import { redirect } from "next/navigation";
import { me } from "@/lib/guard";
import { readFile } from "node:fs/promises";
import path from "node:path";
import "./brain.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain artwork · Admin" };

// The animated brain that used to be the admin landing page, kept at /admin/brain for reuse. Drop the artwork at public/admin-brain.svg.
// Inline (not <img>) so brain.css can animate #lighting and #pins-charge.
export default async function Brain() {
  const m = await me();
  if (!m || !Object.keys(m.perms).length) redirect("/admin-login?next=/admin/brain" + (m ? "&denied=1" : ""));
  const brain = await readFile(path.join(process.cwd(), "public/admin-brain.svg"), "utf8").catch(() => "");
  return (
    <div className="landing">
      <div dangerouslySetInnerHTML={{ __html: brain }} />
    </div>
  );
}
