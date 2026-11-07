import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, type Cfg } from "./config";

// forcePathStyle: RustFS/MinIO-style servers address buckets by path, not subdomain.
export const clientFor = (c: Cfg["s3"]) =>
  new S3Client({ region: c.region, endpoint: c.endpoint, forcePathStyle: true, credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey } });

const g = globalThis as unknown as { s3?: { key: string; client: S3Client } };

export function s3(): { client: S3Client; bucket: string } | null {
  const c = getConfig();
  if (!c) return null;
  const key = JSON.stringify(c.s3);
  if (g.s3?.key !== key) g.s3 = { key, client: clientFor(c.s3) };
  return { client: g.s3.client, bucket: c.s3.bucket };
}

/** Creates the bucket if missing, then proves write/read/delete work. Throws on failure. */
export async function probeS3(c: Cfg["s3"]) {
  const client = clientFor(c);
  try { await client.send(new HeadBucketCommand({ Bucket: c.bucket })); }
  catch { await client.send(new CreateBucketCommand({ Bucket: c.bucket })); }
  const Key = ".setup-probe";
  await client.send(new PutObjectCommand({ Bucket: c.bucket, Key, Body: "ok" }));
  await (await client.send(new GetObjectCommand({ Bucket: c.bucket, Key }))).Body!.transformToString();
  await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key }));
}
