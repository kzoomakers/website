import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, type S3Cfg } from "./config";
import { db } from "./db";

// forcePathStyle: RustFS/MinIO-style servers address buckets by path, not subdomain.
export const clientFor = (c: S3Cfg) =>
  new S3Client({ region: c.region, endpoint: c.endpoint, forcePathStyle: true, credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey } });

const g = globalThis as unknown as { s3?: { key: string; client: S3Client }; s3cfg?: { v: S3Cfg | null; at: number } };

/** Storage settings: the settings row saved on /admin/services, else the legacy S3_* env / config.json. Cached 30s so image requests don't each hit the DB. */
export async function s3Settings(): Promise<S3Cfg | null> {
  const c = getConfig(), d = db();
  if (!c || !d) return null;
  if (g.s3cfg && Date.now() - g.s3cfg.at < 30_000) return g.s3cfg.v;
  await d.ready;
  const v = ((await d.pool.query("SELECT data FROM settings WHERE key='s3'")).rows[0]?.data as S3Cfg | undefined) ?? c.s3 ?? null;
  g.s3cfg = { v, at: Date.now() };
  return v;
}
export const forgetS3Settings = () => { g.s3cfg = undefined; };

export async function s3(): Promise<{ client: S3Client; bucket: string } | null> {
  const c = await s3Settings();
  if (!c) return null;
  const key = JSON.stringify(c);
  if (g.s3?.key !== key) g.s3 = { key, client: clientFor(c) };
  return { client: g.s3.client, bucket: c.bucket };
}

/** Creates the bucket if missing, then proves write/read/delete work. Throws on failure. */
export async function probeS3(c: S3Cfg) {
  const client = clientFor(c);
  try { await client.send(new HeadBucketCommand({ Bucket: c.bucket })); }
  catch { await client.send(new CreateBucketCommand({ Bucket: c.bucket })); }
  const Key = ".setup-probe";
  await client.send(new PutObjectCommand({ Bucket: c.bucket, Key, Body: "ok" }));
  await (await client.send(new GetObjectCommand({ Bucket: c.bucket, Key }))).Body!.transformToString();
  await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key }));
}
