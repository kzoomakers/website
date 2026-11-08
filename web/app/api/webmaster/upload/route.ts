import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { actor, editingAllowed } from "@/lib/guard";
import { registerMedia } from "@/lib/media";
import { s3 } from "@/lib/s3";
import { ImageError, imageFail, processImage, uploadGate } from "@/lib/image";

export async function POST(req: Request) {
  if (!(await editingAllowed("webmaster")) && !(await editingAllowed("blog")) && !(await editingAllowed("mail"))) return new NextResponse("not found", { status: 404 });
  const no = await uploadGate(req, await actor(), 300); // admins upload in batches
  if (no) return no;
  const form = await req.formData().catch(() => null), file = form?.get("file");
  if (!form || !(file instanceof File)) return new NextResponse("Choose an image.", { status: 400 });
  const store = await s3();
  if (!store) return new NextResponse("storage not set up", { status: 503 });
  // Trust the bytes, not the client's claim: the worker decodes the real image (JPG, PNG, WebP, GIF, HEIC...), caps it at 12MP and re-encodes it as WebP (animations stay animated), or as JPEG/GIF for newsletter images (email: Outlook shows no WebP). Avatars become 240px squares, everything else at most 2000px wide.
  const avatar = !!form.get("avatar");
  let img;
  try { img = await processImage(file, avatar ? { still: true, fit: { width: 240, height: 240, cover: true } } : { fit: { width: 2000 }, email: !!form.get("email") }); } catch (e) { if (e instanceof ImageError) return imageFail(e); throw e; }
  const type = `image/${img.format}`, key = `${randomUUID()}.${img.format === "jpeg" ? "jpg" : img.format}`, body = img.data;
  await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: body, ContentType: type }));
  // Everything but avatars shows up in the media library; a library failure must not lose the upload.
  if (!avatar) await registerMedia(key, file.name, type, body.length, await actor()).catch(() => {});
  return NextResponse.json({ url: `/uploads/${key}` });
}
