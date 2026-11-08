import Link from "next/link";
import { redirect } from "next/navigation";
import { levelOf, me, type Section } from "@/lib/guard";
import Needs from "./needs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin home · Kzoo Makers" };

const QUICK: [Section, string, string][] = [["blog", "/admin/blog/new", "New post"], ["mail", "/admin/mail/email/new", "New email"], ["board", "/admin/signed-docs/new", "New document"], ["tours", "/admin/tours", "Tours this week"], ["webmaster", "/admin/webmaster", "Edit pages"], ["crm", "/admin/crm", "Find a person"]];

// Where everyone lands after signing in: what is waiting for them, and shortcuts to the common jobs they have access to.
export default async function Landing() {
  const m = await me();
  if (!m || !Object.keys(m.perms).length) redirect("/admin-login?next=/admin/landing" + (m ? "&denied=1" : ""));
  const quick = QUICK.filter(([s]) => levelOf(m, s) === "write");
  return (
    <>
      <h1>Admin home</h1>
      <p className="sub">Welcome, {m.name.split(" ")[0]}. The tabs along the top lead to each area.</p>
      <Needs />
      {quick.length > 0 && <section aria-labelledby="quick-h"><h2 id="quick-h">Common jobs</h2><div className="bar">{quick.map(([, href, label]) => <Link key={href} href={href} className="btn">{label}</Link>)}</div></section>}
    </>
  );
}
