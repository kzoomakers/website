import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { actor, editingAllowed } from "@/lib/guard";
import { imageFail, processImage, uploadGate } from "@/lib/image";
import { s3 } from "@/lib/s3";

export const dynamic = "force-dynamic";

// POST (multipart "file"): a diagram or picture for a training question. Decoded and re-encoded by the image worker (never trusted as sent), at most 1600px wide, stored as WebP under training/.
export async function POST(req: Request) {
  if (!(await editingAllowed("training", "write", "tests"))) return new NextResponse("not found", { status: 404 });
  const no = await uploadGate(req, await actor(), 60);
  if (no) return no;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return new NextResponse("Choose an image.", { status: 400 });
  const store = await s3();
  if (!store) return new NextResponse("Image storage isn't set up.", { status: 503 });
  try {
    const img = await processImage(file, { still: true, fit: { width: 1600, height: 1600 } });
    const key = `training/${randomUUID()}.webp`;
    await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: img.data, ContentType: "image/webp" }));
    return NextResponse.json({ url: `/uploads/${key}`, width: img.width, height: img.height });
  } catch (e) { return imageFail(e); }
}
