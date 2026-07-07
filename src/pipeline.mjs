import { createHash } from "node:crypto";

import { RANGE_BYTES, RETRY_RANGE_BYTES, rangeGet } from "./r2.mjs";
import { extractFromBuffer, deriveAlbum, buildPublicUrl } from "./extract.mjs";

export const CONCURRENCY = 8;

const EMPTY_META = {
  rating: 0,
  keywords: [],
  hierarchicalKeywords: [],
  width: null,
  height: null,
  dateTaken: null,
  camera: null,
  lens: null,
  exposureTime: null,
  fNumber: null,
  iso: null,
  focalLength: null,
};

export function fmtBytes(n) {
  return n.toLocaleString("en-US");
}

/** Run `worker(item, index)` over all items with a fixed number of lanes. */
export async function runPool(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, lane)
  );
  return results;
}

/** Stable fingerprint of an album's photo set — cheap change detection. */
export function etagsHash(photos) {
  const h = createHash("sha1");
  for (const p of photos) h.update(`${p.key}:${p.etag}\n`);
  return h.digest("hex");
}

/**
 * Range-read one object and extract normalized metadata, retrying once at
 * RETRY_RANGE_BYTES if the small read yields nothing usable.
 * Returns { row, buffer } — buffer is the (partial) bytes actually parsed.
 */
export async function extractPhoto(obj, { quiet = false } = {}) {
  let usedBytes = Math.min(RANGE_BYTES, obj.size);
  let buffer = await rangeGet(obj.key, RANGE_BYTES);
  let meta = null;
  let neededRetry = false;

  try {
    meta = await extractFromBuffer(buffer);
  } catch {
    meta = null;
  }

  // Retry once at a larger range if the parse failed outright or produced
  // neither a rating nor dimensions (metadata likely sits past 128 KB).
  const looksEmpty = !meta || (meta.rating === 0 && !meta.width && !meta.height);
  if (looksEmpty && obj.size > RANGE_BYTES) {
    neededRetry = true;
    usedBytes = Math.min(RETRY_RANGE_BYTES, obj.size);
    buffer = await rangeGet(obj.key, RETRY_RANGE_BYTES);
    try {
      meta = await extractFromBuffer(buffer);
    } catch {
      meta = null;
    }
  }

  if (!quiet) {
    const pct = ((usedBytes / obj.size) * 100).toFixed(1);
    console.log(
      `  ↓ ${fmtBytes(usedBytes)} bytes of ${fmtBytes(obj.size)} (${pct}%) — ${obj.key}` +
        (neededRetry ? "  [retried @ 512 KB]" : "")
    );
  }

  const row = {
    key: obj.key,
    album: deriveAlbum(obj.key),
    filename: obj.key.split("/").pop(),
    publicUrl: buildPublicUrl(obj.key),
    etag: obj.etag,
    size: obj.size,
    lastModified: obj.lastModified,
    neededRetry,
    parseFailed: meta == null,
    ...(meta ?? EMPTY_META),
  };
  return { row, buffer };
}
