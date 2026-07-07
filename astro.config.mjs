import { defineConfig } from 'astro/config';

// Fully static site deployed to Cloudflare PAGES (dist/ upload).
// Deliberately NO @astrojs/cloudflare adapter: in Astro 6 it dropped Pages
// support and forces server output. Photos are remote (photocdn.dag.gy with
// Image Transformations), so no build-time image processing either.
export default defineConfig({
  output: 'static',
  // site: 'https://<your-domain>', // set when the production domain exists
});
