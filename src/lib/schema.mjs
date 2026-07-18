// Shared JSON-LD builders. Everything hangs off one Person node with a
// stable @id, so crawlers and answer engines resolve every photograph,
// album, and page back to the same entity.
import { SITE_NAME, INSTAGRAM_URL } from './site.mjs';

export function personRef(site) {
  return { '@id': new URL('/#person', site).href };
}

export function personNode(site) {
  return {
    '@type': 'Person',
    '@id': new URL('/#person', site).href,
    name: 'Arnav Jindal',
    alternateName: SITE_NAME,
    url: new URL('/about/', site).href,
    image: new URL(
      '/cdn-cgi/image/width=800,format=jpeg,quality=82/assets/about_photo.jpg',
      site
    ).href,
    sameAs: [INSTAGRAM_URL],
    description:
      'Amateur photographer — street and landscape work on a Fujifilm X-T5 and 35mm film.',
    alumniOf: { '@type': 'CollegeOrUniversity', name: 'Duke University' },
    knowsAbout: [
      'street photography',
      'landscape photography',
      '35mm film photography',
      'darkroom processing',
    ],
  };
}

export function webSiteNode(site) {
  return {
    '@type': 'WebSite',
    '@id': new URL('/#website', site).href,
    url: site.href ?? String(site),
    name: SITE_NAME,
    description: 'Street and landscape photography by Arnav Jindal.',
    publisher: personRef(site),
  };
}

/** items: [name, path][] — path relative, e.g. ['Albums', '/albums/'] */
export function breadcrumbs(site, items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: new URL(path, site).href,
    })),
  };
}

export function graph(...nodes) {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}
