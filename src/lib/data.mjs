// Load and normalize data/manifest.json (built by scripts/build-manifest.mjs).
// Every field except `key`/`album` is treated as optional.
// Static import: Vite inlines the JSON at build time, so the data is baked
// into the prerender bundle (an fs read would break once modules are moved
// into dist/.prerender/).
import manifestJson from '../../data/manifest.json';

function manifest() {
  return manifestJson;
}

export function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShutter(t) {
  if (!t || t <= 0) return null;
  return t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}`;
}

function formatExposure(p) {
  const parts = [
    formatShutter(p.exposureTime),
    p.fNumber ? `f/${p.fNumber}` : null,
    p.iso ? `ISO ${p.iso}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function normalize(p) {
  const width = p.width || 3;
  const height = p.height || 2;
  const stem = (p.filename || p.key.split('/').pop() || '').replace(/\.[^.]+$/, '');
  return {
    key: p.key,
    id: `${slugify(p.album)}-${slugify(stem)}`,
    album: p.album,
    albumSlug: slugify(p.album),
    title: stem,
    rating: p.rating ?? 0,
    width,
    height,
    ratio: width / height,
    dateTaken: p.dateTaken || null,
    dateDisplay: formatDate(p.dateTaken),
    camera: p.camera || '',
    lens: p.lens || '',
    exposure: formatExposure(p),
    keywords: p.keywords?.length ? p.keywords : (p.hierarchicalKeywords || []),
  };
}

let _photos;
export function allPhotos() {
  _photos ??= (manifest().photos || []).map(normalize);
  return _photos;
}

export function fiveStar() {
  return allPhotos().filter((p) => p.rating === 5);
}

const byDateDesc = (a, b) => (b.dateTaken || '').localeCompare(a.dateTaken || '');

let _albums;
/** Albums A→Z; photos within each sorted newest first. */
export function albums() {
  if (_albums) return _albums;
  const groups = new Map();
  for (const p of allPhotos()) {
    if (!groups.has(p.album)) groups.set(p.album, []);
    groups.get(p.album).push(p);
  }
  _albums = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, photos]) => {
      photos.sort(byDateDesc);
      const years = photos.map((p) => p.dateTaken?.slice(0, 4)).filter(Boolean);
      const places = [...new Set(photos.flatMap((p) => p.keywords))];
      return {
        name,
        slug: slugify(name),
        photos,
        count: photos.length,
        year: years.length ? Math.max(...years.map(Number)) : null,
        cover: photos.find((p) => p.rating === 5) || photos[0],
        places,
      };
    });
  return _albums;
}

export function albumBySlug(slug) {
  return albums().find((a) => a.slug === slug);
}
