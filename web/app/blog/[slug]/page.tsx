import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthor, getPost } from "@/lib/blog";
import { Body } from "@/lib/blog-body";
import { currentVerified } from "@/lib/readers";
import { getSettings, listThread } from "@/lib/comments";
import { absUrl, articleLd, ldScript } from "@/lib/aiseo";
import { SITE, urlOf } from "@/lib/sitemap";
import Shell from "../shell";
import Comments from "../comments";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const p = await getPost((await params).slug);
  return p && { title: `${p.title} | Kzoo Makers`, description: p.excerpt, alternates: { canonical: urlOf("blog/" + p.slug) }, openGraph: { type: "article", title: p.title, description: p.excerpt, url: urlOf("blog/" + p.slug), ...(p.image && { images: [absUrl(SITE, p.image)] }) } };
}

export default async function Post({ params }: P) {
  const slug = (await params).slug;
  const p = await getPost(slug);
  if (!p) notFound();
  const me = await currentVerified();
  const [comments, author, cs] = await Promise.all([listThread(p.id, me?.id ?? null), p.author_id ? getAuthor(p.author_id) : null, getSettings()]);
  const closed = cs.closeAfterDays > 0 && Date.now() - new Date(p.publish_at ?? p.updated_at).getTime() > cs.closeAfterDays * 864e5;
  return (
    <Shell title={p.title}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(articleLd({ title: p.title, excerpt: p.excerpt, image: p.image, date: new Date(p.publish_at ?? p.updated_at).toISOString(), modified: new Date(p.updated_at).toISOString(), author: p.author_name, url: urlOf("blog/" + slug) }, SITE)) }} />
      <small>{new Date(p.publish_at ?? p.updated_at).toLocaleDateString("en-US", { dateStyle: "long" })}
        {p.author_name && <> · <Link href={`/blog?author=${p.author_id}`}>{p.author_name}</Link></>}
        {p.categories.map((c) => <span key={c.slug}> · <Link href={`/blog?category=${c.slug}`}>{c.name}</Link></span>)}</small>
      {p.image && <img src={p.image} alt="" style={{ maxWidth: "100%", borderRadius: 6, display: "block", margin: "12px 0" }} />}
      <style>{`.blog-body img{max-width:100%;height:auto}.blog-body blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:12px;color:#555}.blog-body pre{background:#f4f4f4;padding:8px;border-radius:6px;overflow:auto}`}</style>
      <Body text={p.body} />
      {author?.bio && <aside style={{ display: "flex", gap: 12, margin: "32px 0", padding: 16, background: "#f7f7f7", borderRadius: 8 }}>
        {author.image && <img src={author.image} alt="" width={64} height={64} style={{ borderRadius: "50%", objectFit: "cover" }} />}
        <div><strong>{author.name}</strong><p style={{ margin: 0 }}>{author.bio}</p></div></aside>}
      {p.tags.length > 0 && <p>{p.tags.map((t) => <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`} style={{ marginRight: 8 }}>#{t}</Link>)}</p>}
      <Comments postId={p.id} initial={comments} me={me?.name ?? null} closed={closed} login={`/login?next=${encodeURIComponent("/blog/" + slug)}`} />
      <p><Link href="/blog">← All posts</Link></p>
    </Shell>
  );
}
