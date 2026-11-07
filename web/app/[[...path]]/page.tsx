import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import { config } from "@/lib/puck-config";
import { getPage, slugOf } from "@/lib/store";
import LegacyScripts from "@/components/legacy-scripts";

export const dynamic = "force-dynamic"; // POC: always read fresh; Phase 2 moves to ISR + revalidate on publish

type P = { params: Promise<{ path?: string[] }> };

export async function generateMetadata({ params }: P) {
  const data = await getPage(slugOf((await params).path));
  const r: any = data?.root?.props ?? {};
  return { title: r.title, description: r.description };
}

export default async function Page({ params }: P) {
  const data = await getPage(slugOf((await params).path));
  if (!data) notFound();
  const bodyClass = ((data.root?.props as any)?.bodyClass ?? "").replace(/[^\w\- ]/g, "");
  const refresh = (data.root?.props as any)?.refresh;
  return (
    <>
      {refresh && <meta httpEquiv="refresh" content={refresh} />}
      {/* Inline script runs during parse, so the body class is set before first paint (no flash). */}
      {bodyClass && <script dangerouslySetInnerHTML={{ __html: `document.body.className+=" ${bodyClass}"` }} />}
      <div id="preloader"><div className="preloader"><span /><span /><span /><span /><span /><span /></div></div>
      <Render config={config} data={data as any} />
      <LegacyScripts extra={((data.root?.props as any)?.scripts ?? []).map((x: any) => x.src)} />
    </>
  );
}
