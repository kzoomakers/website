import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { actor, editingAllowed } from "@/lib/guard";
import { registerMedia } from "@/lib/media";
import { s3 } from "@/lib/s3";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await editingAllowed("webmaster")) && !(await editingAllowed("blog")) && !(await editingAllowed("mail"))) return new NextResponse("not found", { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !TYPES[file.type]) return new NextResponse("image required (jpg/png/webp/gif)", { status: 400 });
  if (file.size > MAX) return new NextResponse("too large (10MB max)", { status: 413 });
  const store = await s3();
  if (!store) return new NextResponse("storage not set up", { status: 503 });
  let body = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the client's claimed MIME: sharp re-encodes in the input's real format, so label it with that.
  const real = await sharp(body).metadata().then((m) => m.format, () => undefined);
  const type = Object.keys(TYPES).find((t) => t === `image/${real}`);
  if (!type) return new NextResponse("image required (jpg/png/webp/gif)", { status: 400 });
  const key = `${randomUUID()}.${TYPES[type]}`;
  // Keep uploads from being gigantic: avatars become 240px squares, everything else is capped at 2000px wide. GIFs are left alone (animation).
  if (type !== "image/gif") {
    const img = sharp(body).rotate();
    body = await (form.get("avatar") ? img.resize(240, 240, { fit: "cover" }) : img.resize({ width: 2000, withoutEnlargement: true })).toBuffer();
  }
  await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: body, ContentType: type }));
  // Everything but avatars shows up in the media library; a library failure must not lose the upload.
  if (!form.get("avatar")) await registerMedia(key, file.name, type, body.length, await actor()).catch(() => {});
  return NextResponse.json({ url: `/uploads/${key}` });
}
