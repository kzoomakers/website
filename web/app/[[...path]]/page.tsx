import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import { config } from "@/lib/puck-config";
import { fillAddress } from "@/lib/hours";
import { getBoard, getHours, getGuided, withRev, getPublicMenu, getPage, slugOf } from "@/lib/store";
import { listPosts } from "@/lib/blog";
import { siteTree } from "@/lib/sitemap";
import { canonicalOf, jsonLd, ldScript } from "@/lib/aiseo";
import { SITE } from "@/lib/sitemap";
import { getPause } from "@/lib/tours-notify";
import LegacyScripts from "@/components/legacy-scripts";

export const dynamic = "force-dynamic"; // POC: always read fresh; Phase 2 moves to ISR + revalidate on publish

type P = { params: Promise<{ path?: string[] }> };

export async function generateMetadata({ params }: P) {
  const slug = slugOf((await params).path);
  const data = fillAddress(await getPage(slug), (await getHours()).contact.address);
  const r: any = data?.root?.props ?? {};
  const url = canonicalOf(slug, data, SITE);
  return { title: r.title, description: r.description, ...(r.noindex && { robots: { index: false } }), alternates: { canonical: url }, openGraph: { title: r.title, description: r.description, url, siteName: "Kzoo Makers", type: "website" }, twitter: { card: "summary", title: r.title, description: r.description } };
}

export default async function Page({ params }: P) {
  const contact = (await getHours()).contact, address = contact.address;
  const data = fillAddress(await getPage(slugOf((await params).path)), address);
  if (!data) notFound();
  const bodyClass = ((data.root?.props as any)?.bodyClass ?? "").replace(/[^\w\- ]/g, "");
  const rp: any = data.root?.props ?? {};
  const bare = !!rp.bare, pause = !bare && slugOf((await params).path) === "index" ? await getPause() : null;
  const refresh = rp.refresh;
  return (
    <>
      {!bare && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(jsonLd(slugOf((await params).path), data, contact, SITE)) }} />}
      {pause?.paused && <div role="status" style={{ background: "#fff6e0", borderBottom: "1px solid #f9b234", padding: "10px 16px", textAlign: "center", position: "relative", zIndex: 1000 }}>{pause.message} <a href="/tours">Join the tour queue</a></div>}
      {refresh && <meta httpEquiv="refresh" content={refresh} />}
      {/* Inline script runs during parse, so the body class is set before first paint (no flash). */}
      {bodyClass && <script dangerouslySetInnerHTML={{ __html: `document.body.className+=" ${bodyClass}"` }} />}
      {!bare && <div id="preloader"><div className="preloader"><span /><span /><span /><span /><span /><span /></div></div>}
      <Render config={config} data={data as any} metadata={{ sitemap: slugOf((await params).path) === "sitemap" ? (await siteTree()).tree : undefined, menu: await getPublicMenu(), board: await getBoard(), posts: slugOf((await params).path) === "index" ? (await listPosts({ limit: 3, light: true })).map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, image: p.image, date: p.publish_at ?? p.updated_at })) : undefined, guided: { [slugOf((await params).path)]: fillAddress(await withRev(slugOf((await params).path), await getGuided(slugOf((await params).path))), address) } }} />
      <LegacyScripts bare={bare} extra={(rp.scripts ?? []).map((x: any) => x.src)} inline={(rp.inline ?? []).map((x: any) => x.code)} />
    </>
  );
}
