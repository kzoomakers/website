import { notFound } from "next/navigation";
import { libraryOn } from "@/lib/learn-flags";
import { getDoc } from "@/lib/library/docs";
import { viewer } from "@/lib/library/viewer";
import Viewer from "../../waiver/viewer";
import MembersShell from "../../shell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// One document. The PDF is served by /api/library/file with a sandbox CSP, never from a user-controlled path.
export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, v = await viewer();
  if (!(await libraryOn()) && !v.staff) notFound();
  const d = await getDoc(v, slug);
  if (!d) notFound();
  return (
    <MembersShell title={d.title} path={`/members/library/${slug}`}>
      {() => (
        <>
          <p className="sub">{d.type} · {d.pages} page{d.pages === 1 ? "" : "s"}{d.description ? ` · ${d.description}` : ""}</p>
          <p><a className="btn" href={`/api/library/file/${slug}?download=1`}>Download PDF</a> <a href={`/api/library/file/${slug}`} target="_blank" rel="noreferrer">Open in a new tab</a></p>
          <Viewer src={`/api/library/file/${slug}`} open />
        </>
      )}
    </MembersShell>
  );
}
