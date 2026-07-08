// Google Images sitemap: one <url> per photo page with its image attached.
// The regular sitemap-index.xml covers pages; this one tells image search
// exactly which image belongs to which URL.
import { allPhotos } from '../lib/data.mjs';
import { imageUrl, FULL_WIDTH } from '../lib/cdn.mjs';

const SITE = 'https://photo.dag.gy';

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET() {
  const urls = allPhotos()
    .map(
      (p) => `  <url>
    <loc>${SITE}/photo/${p.id}/</loc>
    <image:image>
      <image:loc>${escapeXml(imageUrl(p.key, FULL_WIDTH))}</image:loc>
      <image:title>${escapeXml(`${p.title} — ${p.album}`)}</image:title>
    </image:image>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
