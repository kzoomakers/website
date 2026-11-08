import { getFinancial } from "@/lib/financials";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^(\d{4})\.pdf$/.exec((await params).file);
  const f = m && (await getFinancial(Number(m[1])));
  if (!f) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${m[1]}-form-990.pdf"`, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" },
  });
}
