import { redirect } from "next/navigation";
import { me } from "@/lib/guard";
import { readFile } from "node:fs/promises";
import path from "node:path";
import "./landing.css";

export const dynamic = "force-dynamic";

// Where everyone lands after signing in; the top bar leads on to the sections they can open.
export default async function Landing() {
  const m = await me();
  if (!m || !Object.keys(m.perms).length) redirect("/admin-login?next=/admin/landing" + (m ? "&denied=1" : ""));
  // Inline (not <img>) so landing.css can animate #lighting and #pins-charge. Drop the artwork at public/admin-brain.svg.
  const brain = await readFile(path.join(process.cwd(), "public/admin-brain.svg"), "utf8").catch(() => "");
  return (
    <div className="landing">
      <div dangerouslySetInnerHTML={{ __html: brain }} />
    </div>
  );
}
