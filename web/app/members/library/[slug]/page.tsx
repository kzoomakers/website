import { notFound } from "next/navigation";
import { libraryOn } from "@/lib/learn-flags";
import { ackState, getDoc } from "@/lib/library/docs";
import { viewer } from "@/lib/library/viewer";
import { needsAck } from "@/lib/library/rules";
import Ack from "./ack";
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
  const ack = v.id !== null && needsAck(d.type) ? await ackState(v.id, d.id) : undefined;
  return (
    <MembersShell title={d.title} path={`/members/library/${slug}`}>
      {() => (
        <>
          <p className="sub">{d.type} · {d.pages} page{d.pages === 1 ? "" : "s"}{d.description ? ` · ${d.description}` : ""}</p>
          {v.id !== null && needsAck(d.type) && (ack?.version === d.current_version
            ? <p>✅ You read version {ack.version} on {new Date(ack.at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/Detroit" })}.</p>
            : <><p className="sub">{ack ? `This document changed since you read version ${ack.version}.` : "Please read this document, then confirm below."}</p><Ack slug={slug} version={d.current_version} /></>)}
          <p><a className="btn" href={`/api/library/file/${slug}?download=1`}>Download PDF</a> <a href={`/api/library/file/${slug}`} target="_blank" rel="noreferrer">Open in a new tab</a></p>
          <Viewer src={`/api/library/file/${slug}`} open />
        </>
      )}
    </MembersShell>
  );
}
