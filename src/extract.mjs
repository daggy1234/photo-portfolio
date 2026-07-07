import exifr from "exifr";
import { PUBLIC_BASE_URL } from "./r2.mjs";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "tif",
  "tiff",
]);

const PARSE_OPTIONS = {
  xmp: true,
  iptc: true,
  tiff: true,
  exif: true,
  mergeOutput: true,
};

function asArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/** XMP text values can arrive as "x", {value:"x"}, or [{value:"x"}]. */
function xmpText(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return xmpText(value[0]);
  if (typeof value === "object") return xmpText(value.value);
  const s = String(value).trim();
  return s || null;
}

function toIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

/**
 * Read pixel dimensions from the JPEG SOF segment. Lightroom exports often
 * omit ExifImageWidth/Height, so the SOF marker is the reliable source.
 * Returns null if no SOF marker exists within the (partial) buffer.
 */
export function jpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xda) return null; // start of scan — SOF should have appeared already
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** Full unfiltered exifr parse — used to dump the first image's raw metadata. */
export async function extractRaw(buffer) {
  return exifr.parse(buffer, PARSE_OPTIONS);
}

/**
 * Parse a (partial) image buffer into a normalized metadata object.
 * Every field is optional in the source file; missing values never throw.
 */
export async function extractFromBuffer(buffer) {
  const meta = (await exifr.parse(buffer, PARSE_OPTIONS)) ?? {};

  const rating = Number.isFinite(Number(meta.Rating))
    ? Math.max(0, Math.min(5, Math.trunc(Number(meta.Rating))))
    : 0;

  const sof = jpegDimensions(buffer);
  const width =
    meta.ImageWidth ?? meta.ExifImageWidth ?? meta.PixelXDimension ?? sof?.width ?? null;
  const height =
    meta.ImageHeight ?? meta.ExifImageHeight ?? meta.PixelYDimension ?? sof?.height ?? null;

  return {
    rating,
    // Lightroom's Title/Caption fields (XMP dc:title/dc:description, with
    // IPTC fallbacks) — surfaced on the site when present.
    title: xmpText(meta.title ?? meta.ObjectName ?? meta.Headline),
    caption: xmpText(
      meta.description ?? meta.ImageDescription ?? meta["Caption-Abstract"]
    ),
    keywords: asArray(meta.subject ?? meta.Keywords),
    hierarchicalKeywords: asArray(meta.hierarchicalSubject),
    width,
    height,
    dateTaken: toIso(meta.DateTimeOriginal ?? meta.CreateDate),
    // Extra EXIF captured for the lightbox/captions later (raw values,
    // formatting like "1/250 · f/8 · ISO 200" happens at site-build time).
    camera: [meta.Make, meta.Model].filter(Boolean).join(" ") || null,
    lens: meta.LensModel ?? meta.Lens ?? null,
    exposureTime: meta.ExposureTime ?? null,
    fNumber: meta.FNumber ?? null,
    iso: meta.ISO ?? null,
    focalLength: meta.FocalLength ?? null,
  };
}

/** Album/location is the key's top-level folder, e.g. "New York/x.jpg" → "New York". */
export function deriveAlbum(key) {
  return key.split("/")[0];
}

/** Public CDN URL with each path segment URL-encoded ("New York" → "New%20York"). */
export function buildPublicUrl(key) {
  return PUBLIC_BASE_URL + key.split("/").map(encodeURIComponent).join("/");
}

/** True only for real image objects — skips folder markers and non-images. */
export function isImageKey({ key, size }) {
  if (!key || key.endsWith("/") || size === 0) return false;
  const ext = key.split(".").pop().toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}
