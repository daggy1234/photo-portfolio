# Photo Portfolio

This is my ultra fancy, super custom photography portfolio. It is composed of 3 parts:

# 1. Photos

---

Define the photos in the following manor with `/favourites` going to home page and collection, while `/other` go into main. In addition the `metadata.json` basically takes information defined like:

```json
{
  "collection_name": "",
  "cover_path": "",
  "collection_location": "",
  "collection_location_link": "",
  "description": ""
}
```

and file mapping:

```yaml
collection_name/
    - /favourites
    - /others
    - metadata.json
```

## Extract_utility

This is an interesting package.
1) Uses `photos/` to create `mapping.json` which defines the photos for homepage and static pages
2) Processes and uploads all images to an s3 bucket
3) 

## The site (Astro)

The portfolio itself is a fully static [Astro 6](https://astro.build) site at the repo root, generated from `data/manifest.json`.

```sh
npm install
npm run dev        # local dev server
npm run build      # static build → dist/
npm run preview    # serve the built dist/ locally
```

- **CDN / image config** lives in `src/lib/cdn.mjs`: all photo URLs are built as
  `https://photocdn.dag.gy/cdn-cgi/image/width=…,format=auto,quality=85/<key>` (Cloudflare Image
  Transformations on the R2 custom domain — no local image processing). The only widths used
  sitewide are 400/800/1200 (grid) and 2000 (lightbox + covers) to stay inside the free
  transformations tier. Always `format=auto`; never hard-code `format=avif`.
- **Data loading** is `src/lib/data.mjs` (normalizes the manifest; all EXIF fields optional).
- **Gallery layout** starts with aspect-ratio-aware flex as a no-JS fallback, then partitions
  visible cards into balanced, full-width rows at the measured container width. Every row shares
  one image height, photos keep their full uncropped aspect ratio, and the final cards are balanced
  with the preceding rows instead of leaving a sparse strip.
- **Client JS** handles the per-visit Fisher–Yates shuffle and justified-row partitioning, the
  lightbox (EXIF panel, ←/→/Esc, `#/photo/<id>` deep links), and a tag filter that stays hidden
  until photos carry keywords. Everything degrades with JS disabled.
- **Fonts**: Helvetica system stack for UI; Source Serif 4 700 self-hosted in `public/fonts/`.
- **SEO / embeds**: every photo has a static, crawlable `/photo/<id>/` page; all pages ship
  OpenGraph + Twitter cards (embed images use `format=jpeg` — see `ogImageUrl()`), canonical
  URLs, and JSON-LD entity graphs (WebSite/Person/Photograph/ImageGallery/CollectionPage/
  BreadcrumbList, all referencing one `#person` @id). Also generated per build:
  `sitemap-index.xml`, `image-sitemap.xml` (Google Images), and `llms.txt` (AI crawlers).
  The canonical domain lives in `astro.config.mjs` (`site`), `public/robots.txt`, and the
  two generated endpoints in `src/pages/`.
- **Delivery**: photos and the local About portrait use responsive Cloudflare Image
  Transformations. LCP candidates are preloaded, only the first grid image gets high fetch
  priority, below-fold images lazy-load, and hashed CSS/font assets get long-lived browser caching
  through `public/_headers`.
- **Deploy**: Cloudflare's Git integration builds on every push using `wrangler.jsonc`. Astro
  still prerenders all pages; `src/worker.ts` runs only in front of document requests while
  CSS, fonts, and images stay on the direct static-asset path. Build with `npm run build` and
  deploy with `npx wrangler deploy` (there is still no `@astrojs/cloudflare` adapter).

## Analytics

Page views are recorded at the Cloudflare edge in the `photo_portfolio_page_views` Analytics
Engine dataset. There is no browser beacon for an ad blocker to remove, and no cookie or raw IP
is stored. Each successful HTML navigation records the path, country, referrer hostname, device
class, browser family, edge colo, human/bot classification, language, hostname, and edge document
time. This intentionally reports aggregate requests rather than persistent or personally
identifiable visitors.

The dataset is created automatically on the first production request after deploy. To print a
30-day report, create an API token with **Account Analytics: Read**, set these ignored `.env`
values, and run:

```sh
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
npm run analytics
```

Set `ANALYTICS_DAYS=7` (up to 90) to change the reporting window. The report includes daily
views, top pages, countries, referrers, device/browser splits, bot traffic, and average edge
document time.

## License

- **Code** (site, pipeline, scripts): [MIT](LICENSE).
- **Photographs** (all images, `data/` metadata, everything on photocdn.dag.gy): **all rights
  reserved** — see [LICENSE-PHOTOS](LICENSE-PHOTOS). The MIT grant never extends to the photos.
