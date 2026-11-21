import { headers } from "next/headers";
import { notFound } from "next/navigation";
import qrcode from "qrcode-generator";
import { conn } from "@/lib/db";
import { gate } from "@/lib/guard";
import PrintButton from "../../[slug]/print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print tool QR | Kzoo Makers admin" };

// A printable sheet for a machine: the QR opens the tool's landing page (/library/tool/<id>), which shows only what the person scanning may see.
export default async function ToolQr({ params }: { params: Promise<{ id: string }> }) {
  await gate("library", "/admin/library");
  const id = Number((await params).id), t = Number.isInteger(id) ? (await (await conn()).query("SELECT name FROM tools WHERE id = $1 AND archived_at IS NULL", [id])).rows[0] : null;
  if (!t) notFound();
  const h = await headers(), host = h.get("x-forwarded-host") ?? h.get("host"), proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/library/tool/${id}`, q = qrcode(0, "M");
  q.addData(url); q.make();
  return (
    <div style={{ textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
      <h1>{t.name}</h1>
      <div style={{ width: 300, margin: "0 auto" }} role="img" aria-label={`QR code for ${t.name}`} dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) }} />
      <p>Scan for safety rules, the manual and your authorization.</p>
      <p className="sub" style={{ wordBreak: "break-all" }}>{url}</p>
      <PrintButton />
    </div>
  );
}
