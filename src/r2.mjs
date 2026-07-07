import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

// Default read window for metadata extraction. Lightroom usually writes XMP
// near the start of the file, but exifr's own default search depth is ~320 KB,
// so if parses fail at 128 KB we retry once at the larger size.
export const RANGE_BYTES = 128 * 1024;
export const RETRY_RANGE_BYTES = 512 * 1024;

export const BUCKET = process.env.BUCKET ?? "photoportfolio";
export const PUBLIC_BASE_URL = "https://photocdn.dag.gy/";

const REQUIRED_VARS = ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "ENDPOINT"];
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(
    `Missing required .env variable(s): ${missing.join(", ")}. ` +
      `Expected ACCESS_KEY_ID, SECRET_ACCESS_KEY and ENDPOINT (account-level R2 endpoint).`
  );
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: process.env.ENDPOINT,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});

function friendlyError(err, context) {
  const authCodes = new Set([
    "InvalidAccessKeyId",
    "SignatureDoesNotMatch",
    "AccessDenied",
    "Unauthorized",
  ]);
  if (authCodes.has(err?.Code ?? err?.name) || err?.$metadata?.httpStatusCode === 403) {
    return new Error(
      `R2 rejected the credentials while ${context} (${err.name}). ` +
        `Check ACCESS_KEY_ID / SECRET_ACCESS_KEY in .env and that the token can read bucket "${BUCKET}".`
    );
  }
  if (err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED") {
    return new Error(
      `Could not reach R2 endpoint ${process.env.ENDPOINT} while ${context}. Check ENDPOINT in .env / network.`
    );
  }
  return err;
}

/** Fully-paginated listing. Keys are returned raw (never URL-encoded). */
export async function listAllObjects(prefix) {
  const objects = [];
  let continuationToken;
  try {
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: prefix || undefined,
          ContinuationToken: continuationToken,
        })
      );
      for (const obj of page.Contents ?? []) {
        objects.push({
          key: obj.Key,
          etag: obj.ETag,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    throw friendlyError(err, "listing objects");
  }
  return objects;
}

/** Top-level album folders via delimiter listing, trailing "/" stripped. */
export async function listAlbums() {
  const prefixes = [];
  let continuationToken;
  try {
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          Delimiter: "/",
          ContinuationToken: continuationToken,
        })
      );
      for (const p of page.CommonPrefixes ?? []) {
        prefixes.push(p.Prefix.replace(/\/$/, ""));
      }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    throw friendlyError(err, "listing albums");
  }
  return prefixes;
}

/** Fetch only the first `bytes` of an object as a Buffer (partial read). */
export async function rangeGet(key, bytes = RANGE_BYTES) {
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Range: `bytes=0-${bytes - 1}`,
      })
    );
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    throw friendlyError(err, `range-reading "${key}"`);
  }
}
