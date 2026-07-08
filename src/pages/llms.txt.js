// llms.txt (llmstxt.org): a machine-readable site summary for AI crawlers
// and answer engines. Regenerated from the manifest on every build.
import { albums, allPhotos } from '../lib/data.mjs';
import { visitedCountries } from '../lib/worldmap.mjs';

const SITE = 'https://photo.dag.gy';

export function GET() {
  const albumLines = albums()
    .map((a) => `- [${a.name}](${SITE}/albums/${a.slug}/): ${a.count} photographs${a.year ? `, ${a.year}` : ''}`)
    .join('\n');
  const tags = [...new Set(allPhotos().flatMap((p) => p.keywords))].sort();
  const tagLines = tags.map((t) => `- [${t}](${SITE}/tags/${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/)`).join('\n');

  const body = `# ARNAV JINDAL — Photography

> Street and landscape photography by Arnav Jindal, an amateur photographer
> and Duke University alum who studied abroad in Madrid, Spain. Shot on a
> Fujifilm X-T5 (and X-E3) and 35mm film. ${allPhotos().length} photographs
> across ${albums().length} albums; ${visitedCountries().length} countries visited.

Photographs are © Arnav Jindal, all rights reserved (no reproduction or
ML training use without permission): ${SITE}/license/

## Pages

- [Selected work](${SITE}/): curated grid, shuffled per visit
- [Albums by location](${SITE}/albums/)
- [About the photographer](${SITE}/about/)
- [Licensing](${SITE}/license/)
- [Instagram](https://www.instagram.com/dagtography/)

## Albums

${albumLines}

## Tags

${tagLines}

Every photograph has its own page at ${SITE}/photo/<id>/ with camera, lens,
exposure, and date metadata (also available as schema.org Photograph JSON-LD).
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
