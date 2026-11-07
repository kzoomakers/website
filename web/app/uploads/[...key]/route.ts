import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

// Public read proxy so the bucket itself can stay private.
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!/^[\w\-\/.]+$/.test(key) || key.includes("..")) return new Response("not found", { status: 404 });
  const store = s3();
  if (!store) return new Response("not found", { status: 404 });
  try {
    const o = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }));
    return new Response(o.Body!.transformToWebStream(), {
      headers: { "content-type": o.ContentType ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
