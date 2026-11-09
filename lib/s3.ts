import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface S3Configuration {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

let cachedClient: S3Client | null = null;
let cachedConfiguration: string | null = null;

function getS3Configuration(): S3Configuration | null {
  const region = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.AWS_S3_BUCKET?.trim();

  if (!region || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { region, accessKeyId, secretAccessKey, bucket };
}

/** Returns true only when every required explicit S3 setting is available. */
export function isS3Configured(): boolean {
  return getS3Configuration() !== null;
}

function createS3Client(config: S3Configuration): S3Client {
  const configurationKey = JSON.stringify(config);
  if (cachedClient && cachedConfiguration === configurationKey) {
    return cachedClient;
  }

  cachedConfiguration = configurationKey;
  cachedClient = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return cachedClient;
}

export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  contentDisposition?: string,
): Promise<void> {
  const config = getS3Configuration();
  if (!config) {
    throw new Error("S3 is not configured.");
  }

  await createS3Client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentDisposition: contentDisposition,
    }),
  );
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 60,
): Promise<string> {
  const config = getS3Configuration();
  if (!config) {
    throw new Error("S3 is not configured.");
  }

  return getSignedUrl(
    createS3Client(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}
