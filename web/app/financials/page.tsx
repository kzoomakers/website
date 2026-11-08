import { notFound } from "next/navigation";
import Shell from "../blog/shell";
import { getOrg, listFinancials } from "@/lib/financials";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financials | Kzoo Makers", description: "Public financial documents." };

export default async function Financials() {
  const files = await listFinancials();
  if (!files.length) notFound();
  return (
    <Shell title="Financials" search={false}>
      <h2>Public Financial Documents</h2>
      <p>Download {await getOrg()} Form 990 documents below.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16, marginTop: 24 }}>
        {files.map((f) => (
          <div key={f.year} style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <small style={{ letterSpacing: 1, opacity: 0.6 }}>PDF</small>
            <h3 style={{ margin: "4px 0 16px" }}>{f.year} Form 990</h3>
            <a className="btn btn-sm" href={`/financials/${f.year}.pdf`}>Download {f.year} →</a>
          </div>
        ))}
      </div>
    </Shell>
  );
}
