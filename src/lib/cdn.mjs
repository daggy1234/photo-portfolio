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
export const GRID_WIDTHS = [400, 800, 1200]; // masonry grid renders small
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

// Column breakpoints must match the --cols media queries in global.css.
export const GRID_SIZES = [
  '(min-width: 1544px) 291px',
  '(min-width: 1248px) calc((100vw - 128px) / 4)',
  '(min-width: 952px) calc((100vw - 112px) / 3)',
  '(min-width: 656px) calc((100vw - 96px) / 2)',
  'calc(100vw - 80px)',
].join(', ');

// Landscape cards span 2 columns (see masonry.mjs) — double the slot width.
export const GRID_SIZES_WIDE = [
  '(min-width: 1544px) 598px',
  '(min-width: 1248px) calc((100vw - 128px) / 2 + 16px)',
  '(min-width: 952px) calc((100vw - 112px) * 2 / 3 + 16px)',
  'calc(100vw - 80px)',
].join(', ');

// Album cover tiles: repeat(auto-fit, minmax(340px, 1fr)) with gap 4px.
export const COVER_SIZES = '(min-width: 764px) 50vw, calc(100vw - 80px)';
export const COVER_WIDE_SIZES = '(min-width: 1680px) 1520px, calc(100vw - 80px)';
