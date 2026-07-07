import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Fully static site deployed to Cloudflare (static assets via wrangler.jsonc).
// Deliberately NO @astrojs/cloudflare adapter: in Astro 6 it forces server
// output. Photos are remote (photocdn.dag.gy with Image Transformations), so
// no build-time image processing either.
export default defineConfig({
  output: 'static',
  // Canonical domain — canonical URLs, og:url, and the sitemap derive from
  // this. The site also answers at photo.arnavjindal.com; every page's
  // canonical tag points here so search engines treat this as the one true
  // copy (ideally also 301 the alias to this domain in Cloudflare).
  site: 'https://photo.dag.gy',
  integrations: [sitemap()],
});
