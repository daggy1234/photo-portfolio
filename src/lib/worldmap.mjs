// Build-time world map: projects Natural Earth country shapes to SVG path
// strings, marking the ones listed in data/countries.json as visited.
// Everything runs at `astro build` — the browser gets plain <svg>, zero JS.
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
// 110m resolution: coarse, but indistinguishable at ~1000px wide and an
// order of magnitude less path data than 50m (page weight matters).
import world from 'world-atlas/countries-110m.json';
import countriesJson from '../../data/countries.json';

export const MAP_WIDTH = 975;
export const MAP_HEIGHT = 460;

// Visited countries absent from the 110m atlas get a dot at these lon/lats.
const MICRO_STATES = {
  Vatican: [12.453, 41.903],
  Monaco: [7.42, 43.737],
  Liechtenstein: [9.555, 47.16],
  Singapore: [103.82, 1.35],
  'Hong Kong': [114.17, 22.32],
  Macao: [113.55, 22.198],
};
// Visited countries smaller than this (projected px²) also get a dot —
// a 2px speck doesn't count as "colored in".
const MIN_VISIBLE_AREA = 12;

export function visitedCountries() {
  return countriesJson.countries.map((c) => ({ ...c, match: c.match || c.name }));
}

export function buildWorldMap() {
  const visited = visitedCountries();
  const byMatch = new Map(visited.map((c) => [c.match.toLowerCase(), c]));

  const countries = feature(world, world.objects.countries).features.filter(
    (f) => f.properties.name !== 'Antarctica'
  );

  const projection = geoNaturalEarth1().fitSize([MAP_WIDTH, MAP_HEIGHT], {
    type: 'FeatureCollection',
    features: countries,
  });
  const path = geoPath(projection);

  const found = new Set();
  const markers = [];
  const shapes = countries.map((f) => {
    const entry = byMatch.get(f.properties.name.toLowerCase());
    if (entry) {
      found.add(entry.match.toLowerCase());
      // Too small to read as colored-in → add a dot at the centroid too
      if (path.area(f) < MIN_VISIBLE_AREA) {
        const [x, y] = path.centroid(f);
        markers.push({ x, y, title: entry.name });
      }
    }
    return {
      d: path(f),
      visited: !!entry,
      title: entry ? entry.name : f.properties.name,
    };
  });

  // Dots for visited countries that don't exist at this scale at all.
  // A "lonLat": [lon, lat] in countries.json works for any territory the
  // atlas doesn't know, without touching this file.
  for (const c of visited) {
    const lonLat = c.lonLat || MICRO_STATES[c.match];
    if (!found.has(c.match.toLowerCase()) && lonLat) {
      const [x, y] = projection(lonLat);
      markers.push({ x, y, title: c.name });
      found.add(c.match.toLowerCase());
    }
  }

  // Anything in the JSON that never matched a shape or a dot is a typo —
  // fail the build loudly rather than silently un-color a country.
  const missing = visited.filter((c) => !found.has(c.match.toLowerCase()));
  if (missing.length) {
    throw new Error(
      `data/countries.json: no Natural Earth match for ${missing
        .map((c) => `"${c.name}"`)
        .join(', ')} — add a "match" field with the Natural Earth name, ` +
        `or a "lonLat": [longitude, latitude] to draw it as a dot.`
    );
  }

  return { shapes, markers };
}
