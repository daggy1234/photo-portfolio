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
- **Masonry** is computed at build time (`src/lib/masonry.mjs` + `.masonry` rules in
  `src/styles/global.css`): CSS Grid row spans over a row unit proportional to the column width,
  so there is no client-side layout JS and zero CLS. Native CSS masonry kicks in via `@supports`
  where browsers ship it.
- **Client JS** is three tiny inline islands (~4 KB total): per-visit Fisher–Yates shuffle +
  infinite-scroll batching, the lightbox (EXIF panel, ←/→/Esc, `#/photo/<id>` deep links), and a
  tag filter that stays hidden until photos carry keywords. Everything degrades with JS disabled.
- **Fonts**: Helvetica system stack for UI; Source Serif 4 700 self-hosted in `public/fonts/`.
- **Deploy**: `.github/workflows/deploy.yml` builds and pushes `dist/` to Cloudflare **Pages**
  (project must be a Pages project, not Workers). Secrets: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`.
