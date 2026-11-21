import { headers } from "next/headers";
import { notFound } from "next/navigation";
import qrcode from "qrcode-generator";
import { gate } from "@/lib/guard";
import { getDoc } from "@/lib/library/docs";
import { STAFF_VIEW } from "@/lib/library/rules";
import PrintButton from "./print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print QR | Kzoo Makers admin" };

// A printable sheet for sticking on a machine: the QR opens the document's member page (sign-in and tier rules still apply).
export default async function QrPage({ params }: { params: Promise<{ slug: string }> }) {
  await gate("library", "/admin/library");
  const { slug } = await params, d = await getDoc(STAFF_VIEW, slug);
  if (!d) notFound();
  const h = await headers(), host = h.get("x-forwarded-host") ?? h.get("host"), proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/members/library/${slug}`, q = qrcode(0, "M");
  q.addData(url); q.make();
  return (
    <div style={{ textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
      <h1>{d.title}</h1>
      <div style={{ width: 300, margin: "0 auto" }} role="img" aria-label={`QR code for ${d.title}`} dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) }} />
      <p>Scan for the manual and safety information.</p>
      <p className="sub" style={{ wordBreak: "break-all" }}>{url}</p>
      <PrintButton />
    </div>
  );
}
