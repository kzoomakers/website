import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

// /images/* and /download/* when the files are not on disk (the Docker image leaves them out; CI syncs them to the bucket under static/). Same URLs, served through the app.
// Trusted files from our own repo, so unlike /uploads there is no sandbox CSP (flyer SVGs embed images that it would block).
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!/^(images|download)\//.test(key) || key.includes("..") || /[\0-\x1f]/.test(key)) return new Response("not found", { status: 404 });
  const store = await s3();
  if (!store) return new Response("not found", { status: 404 });
  try {
    const o = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: "static/" + key, Range: req.headers.get("range") ?? undefined, IfNoneMatch: req.headers.get("if-none-match") ?? undefined }));
    return new Response(o.Body!.transformToWebStream(), {
      status: o.ContentRange ? 206 : 200,
      headers: {
        "content-type": o.ContentType ?? "application/octet-stream", ...(o.ETag && { etag: o.ETag }), ...(o.ContentLength != null && { "content-length": String(o.ContentLength) }),
        ...(o.ContentRange && { "content-range": o.ContentRange }), "accept-ranges": "bytes", "x-content-type-options": "nosniff",
        // Same path can change when a file is replaced, so a day of caching (then revalidate by ETag), not "immutable" like uploads.
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 304) return new Response(null, { status: 304 });
    return new Response("not found", { status: 404 });
  }
}
