import Link from "next/link";
import { listCategories, listPosts, getAuthor } from "@/lib/blog";
import Shell from "./shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blog | Kzoo Makers", alternates: { types: { "application/rss+xml": "/blog/feed.xml" } } };

export default async function Blog({ searchParams }: { searchParams: Promise<{ tag?: string; category?: string; author?: string; q?: string; page?: string }> }) {
  const s = await searchParams, author = Number(s.author) || undefined;
  const [posts, cats, who] = await Promise.all([listPosts({ light: true, tag: s.tag, category: s.category, author, q: s.q?.slice(0, 200) }), listCategories(), author ? getAuthor(author) : null]);
  // shortcut: slices after loading every match; push LIMIT/OFFSET into listPosts if the blog grows past a few hundred posts.
  const per = 10, pages = Math.max(1, Math.ceil(posts.length / per)), page = Math.min(pages, Math.max(1, Number(s.page) || 1));
  const href = (n: number) => `/blog?${new URLSearchParams({ ...(s.q && { q: s.q }), ...(s.tag && { tag: s.tag }), ...(s.category && { category: s.category }), ...(author && { author: String(author) }), page: String(n) })}`;
  const label = s.q ? `Search: ${s.q}` : s.tag ? `Tag: ${s.tag}` : s.category ? cats.find((c) => c.slug === s.category)?.name ?? "Category" : who ? `Posts by ${who.name}` : "Blog";
  return (
    <Shell title={label} q={s.q}>
      {!s.q && !s.tag && !s.category && !author && cats.length > 0 && <p>{cats.map((c) => <Link key={c.id} href={`/blog?category=${c.slug}`} style={{ marginRight: 12 }}>{c.name}</Link>)}</p>}
      {posts.slice((page - 1) * per, page * per).map((p) => (
        <article key={p.id} style={{ marginBottom: 32 }}>
          {p.image && <img src={p.image} alt="" style={{ maxWidth: "100%", borderRadius: 6 }} />}
          <h3><Link href={`/blog/${p.slug}`}>{p.title}</Link></h3>
          <small>{new Date(p.publish_at ?? p.updated_at).toLocaleDateString("en-US", { dateStyle: "long" })}
            {p.author_name && <> · <Link href={`/blog?author=${p.author_id}`}>{p.author_name}</Link></>}
            {p.categories.map((c) => <span key={c.slug}> · <Link href={`/blog?category=${c.slug}`}>{c.name}</Link></span>)}
            {p.tags.map((t) => <span key={t}> · <Link href={`/blog?tag=${encodeURIComponent(t)}`}>#{t}</Link></span>)}</small>
          <p>{p.excerpt}</p>
        </article>
      ))}
      {pages > 1 && <nav aria-label="Pages" style={{ display: "flex", justifyContent: "space-between" }}>{page > 1 ? <Link href={href(page - 1)}>← Newer</Link> : <span />}<span>Page {page} of {pages}</span>{page < pages ? <Link href={href(page + 1)}>Older →</Link> : <span />}</nav>}
      {!posts.length && <p>{s.q ? "No posts match your search." : "No posts yet."}</p>}
    </Shell>
  );
}
