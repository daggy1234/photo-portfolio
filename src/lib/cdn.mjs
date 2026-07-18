// Cloudflare Image Transformations URL helper.
// Derivatives are generated on the fly by the photocdn.dag.gy zone:
//   https://photocdn.dag.gy/cdn-cgi/image/<options>/<source-path>
// Always format=auto (Cloudflare caps AVIF output size; auto negotiates
// AVIF small / WebP-JPEG large). Keep the set of distinct widths tiny —
// every (image, options) pair is a unique transformation against the
// 5,000/month free tier.

const CDN_ORIGIN = 'https://photocdn.dag.gy';
const DEFAULT_QUALITY = 85;

// The only widths used anywhere on the site.
export const GRID_WIDTHS = [400, 800, 1200]; // justified gallery thumbnails
export const FULL_WIDTH = 2000; // lightbox / full view
export const COVER_WIDTHS = [800, 1200, FULL_WIDTH]; // album tiles are large; reuse the 2000 bucket

/** Encode an R2 object key per path segment ("New York/a.jpg" -> "New%20York/a.jpg"). */
export function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

export function imageUrl(key, width, quality = DEFAULT_QUALITY) {
  return `${CDN_ORIGIN}/cdn-cgi/image/width=${width},format=auto,quality=${quality}/${encodeKey(key)}`;
}

export function srcset(key, widths = GRID_WIDTHS) {
  return widths.map((w) => `${imageUrl(key, w)} ${w}w`).join(', ');
}

// Social-embed image (og:image / twitter:image). Explicit JPEG — format=auto
// can hand unfurl crawlers WebP/AVIF, which some link previewers reject.
export function ogImageUrl(key) {
  return `${CDN_ORIGIN}/cdn-cgi/image/width=1200,format=jpeg,quality=85/${encodeKey(key)}`;
}

// Justified rows render landscapes around 500px wide and portraits around
// 230–300px on large screens. Conservative hints let high-density displays
// select the 1200px derivative without making portraits over-fetch it.
export const GRID_SIZES_LANDSCAPE = [
  '(min-width: 1400px) 500px',
  '(min-width: 900px) 55vw',
  '(min-width: 656px) 60vw',
  'calc(100vw - 80px)',
].join(', ');

export const GRID_SIZES_PORTRAIT = [
  '(min-width: 1400px) 300px',
  '(min-width: 900px) 34vw',
  '(min-width: 656px) 40vw',
  'calc(100vw - 80px)',
].join(', ');

export function gridSizes(ratio) {
  return ratio > 1 ? GRID_SIZES_LANDSCAPE : GRID_SIZES_PORTRAIT;
}

// Album cover tiles: repeat(auto-fit, minmax(340px, 1fr)) with gap 4px.
export const COVER_SIZES = '(min-width: 764px) 50vw, calc(100vw - 80px)';
export const COVER_WIDE_SIZES = '(min-width: 1680px) 1520px, calc(100vw - 80px)';
