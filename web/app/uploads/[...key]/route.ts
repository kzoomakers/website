import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

// Public read proxy so the bucket itself can stay private.
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!/^[\w\-\/.]+$/.test(key) || key.includes("..")) return new Response("not found", { status: 404 });
  const store = await s3();
  if (!store) return new Response("not found", { status: 404 });
  try {
    const o = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key, IfNoneMatch: req.headers.get("if-none-match") ?? undefined }));
    const type = o.ContentType ?? "application/octet-stream";
    return new Response(o.Body!.transformToWebStream(), {
      headers: {
        "content-type": type, ...(o.ETag && { etag: o.ETag }), ...(o.ContentLength != null && { "content-length": String(o.ContentLength) }), "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff",
        // An SVG or HTML file opened directly could run script on our origin; sandboxed, it can't. (Images in <img> are unaffected.)
        ...(/svg|html|xml/i.test(type) && { "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" }),
      },
    });
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 304) return new Response(null, { status: 304 }); // the browser's copy is current (S3 says so, no body moved)
    return new Response("not found", { status: 404 });
  }
}
