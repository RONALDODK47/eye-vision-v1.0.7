/**
 * Cliente MinIO (S3-compatible) — PDFs e blobs por office_token.
 */
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildExtratoPdfKey } from './object-keys.mjs';

export { buildExtratoPdfKey };

/** @type {S3Client | null} */
let client = null;
let bucketEnsured = false;

export function isMinioEnabled() {
  return Boolean(String(process.env.MINIO_ACCESS_KEY || '').trim());
}

export function getMinioBucket() {
  return String(process.env.MINIO_BUCKET || 'eye-vision').trim() || 'eye-vision';
}

function getMinioClient() {
  if (!client) {
    const endpoint = String(process.env.MINIO_ENDPOINT || '127.0.0.1').trim();
    const port = String(process.env.MINIO_PORT || '9000').trim();
    const useSsl = String(process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true';
    const accessKey = String(process.env.MINIO_ACCESS_KEY || 'eyevision').trim();
    const secretKey = String(process.env.MINIO_SECRET_KEY || 'eyevisionsecret').trim();
    client = new S3Client({
      region: 'us-east-1',
      endpoint: `${useSsl ? 'https' : 'http'}://${endpoint}:${port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }
  return client;
}

export async function ensureMinioBucket() {
  if (bucketEnsured) return;
  const s3 = getMinioClient();
  const bucket = getMinioBucket();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err) {
      // Bucket pode já existir (race) — ignora.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists|already exist/i.test(msg)) {
        console.warn('[storage/minio] create bucket:', msg);
      }
    }
  }
  bucketEnsured = true;
}

/**
 * @param {string} objectKey
 * @param {Buffer|Uint8Array} body
 * @param {string} [contentType]
 */
export async function putObject(objectKey, body, contentType = 'application/pdf') {
  await ensureMinioBucket();
  const s3 = getMinioClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: getMinioBucket(),
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }),
  );
  return objectKey;
}

/**
 * @param {string} objectKey
 * @returns {Promise<Buffer|null>}
 */
export async function getObjectBuffer(objectKey) {
  await ensureMinioBucket();
  const s3 = getMinioClient();
  try {
    const out = await s3.send(
      new GetObjectCommand({
        Bucket: getMinioBucket(),
        Key: objectKey,
      }),
    );
    const chunks = [];
    for await (const chunk of out.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function deleteObject(objectKey) {
  if (!objectKey) return;
  await ensureMinioBucket();
  const s3 = getMinioClient();
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: getMinioBucket(),
        Key: objectKey,
      }),
    );
  } catch {
    /* ignore */
  }
}

export async function getPresignedGetUrl(objectKey, expiresIn = 3600) {
  await ensureMinioBucket();
  const s3 = getMinioClient();
  const cmd = new GetObjectCommand({
    Bucket: getMinioBucket(),
    Key: objectKey,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function minioHealth() {
  if (!isMinioEnabled()) {
    return { ok: false, enabled: false, detail: 'MINIO_ACCESS_KEY ausente' };
  }
  try {
    await ensureMinioBucket();
    return { ok: true, enabled: true, bucket: getMinioBucket(), detail: 'minio ok' };
  } catch (err) {
    return {
      ok: false,
      enabled: true,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
