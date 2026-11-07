import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listPosts } from "@/lib/blog";
import Link from "next/link";
import Backup from "./backup";

export const dynamic = "force-dynamic";

export default async function BlogAdminList() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/blog");
  if (!getConfig()) redirect("/admin/webmaster/setup");
  const posts = await listPosts(true);
  const now = Date.now();
  return (
    <>
      <h1>Blog</h1>
      <p className="sub">Posts shown at <a href="/blog">/blog</a>. <a href="/blog/feed.xml">RSS feed</a></p>
      <div className="bar"><Link href="/admin/blog/new"><button className="pri">+ New post</button></Link></div>
      <Backup />
      <div className="card">
        {posts.map((p) => {
          const state = p.status === "draft" ? "Draft" : p.publish_at && Date.parse(p.publish_at) > now ? "Scheduled" : "Published";
          return <div className="row" key={p.id}>
            <Link href={`/admin/blog/${p.id}`}>{p.title}</Link>
            <span className="tag">{state}</span>
            <span className="tag">{new Date(p.publish_at ?? p.updated_at).toLocaleDateString()}</span>
            {state === "Published" && <a className="tag" href={`/blog/${p.slug}`} target="_blank">view ↗</a>}
          </div>;
        })}
        {!posts.length && <p className="sub">No posts yet.</p>}
      </div>
    </>
  );
}
