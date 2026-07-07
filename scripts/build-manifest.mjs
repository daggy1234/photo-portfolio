import { parseArgs } from "node:util";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

import { BUCKET, listAllObjects } from "../src/r2.mjs";
import { deriveAlbum, isImageKey } from "../src/extract.mjs";
import { runPool, extractPhoto, etagsHash } from "../src/pipeline.mjs";

const DATA_DIR = "data";
const ALBUMS_DIR = path.join(DATA_DIR, "albums");
const MASTER_PATH = path.join(DATA_DIR, "manifest.json");

const { values: flags } = parseArgs({
  options: {
    force: { type: "boolean", default: false },
  },
});

async function loadExistingAlbums() {
  const albums = new Map();
  let files;
  try {
    files = await readdir(ALBUMS_DIR);
  } catch {
    return albums; // first run — nothing on disk yet
  }
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    try {
      const parsed = JSON.parse(await readFile(path.join(ALBUMS_DIR, file), "utf8"));
      albums.set(parsed.album, parsed);
    } catch {
      console.warn(`  ! could not parse ${file} — its album will be rebuilt from scratch`);
    }
  }
  return albums;
}

function sortPhotos(photos) {
  return photos.sort(
    (a, b) =>
      (a.dateTaken ?? "").localeCompare(b.dateTaken ?? "") ||
      a.key.localeCompare(b.key)
  );
}

async function main() {
  const now = new Date().toISOString();
  console.log(`Building manifest from bucket "${BUCKET}"${flags.force ? " (--force: full re-extract)" : ""}\n`);

  const listed = await listAllObjects();
  const images = listed.filter(isImageKey);
  const byAlbum = Object.groupBy(images, (o) => deriveAlbum(o.key));
  const existing = await loadExistingAlbums();

  await mkdir(ALBUMS_DIR, { recursive: true });

  const stats = { added: 0, changed: 0, reused: 0, removedPhotos: 0 };
  const albumSummaries = [];
  const allPhotos = [];
  let anyAlbumChanged = false;

  for (const [album, objects] of Object.entries(byAlbum).sort()) {
    const prev = existing.get(album);
    const prevByKey = new Map((prev?.photos ?? []).map((p) => [p.key, p]));

    const needExtract = objects.filter((o) => {
      const old = prevByKey.get(o.key);
      return flags.force || !old || old.etag !== o.etag || old.parseFailed;
    });
    const reusable = objects.filter((o) => !needExtract.includes(o));

    for (const o of needExtract) {
      const old = prevByKey.get(o.key);
      if (!flags.force && old) stats.changed += 1;
      else if (!old) stats.added += 1;
    }
    stats.reused += reusable.length;
    const removed = [...prevByKey.keys()].filter(
      (k) => !objects.some((o) => o.key === k)
    );
    stats.removedPhotos += removed.length;

    const extracted = await runPool(needExtract, (o) =>
      extractPhoto(o).then((r) => r.row)
    );
    const photos = sortPhotos([
      ...reusable.map((o) => prevByKey.get(o.key)),
      ...extracted,
    ]);

    const hash = etagsHash(photos);
    const file = path.join("albums", `${album}.json`);
    const albumChanged = flags.force || !prev || hash !== etagsHash(prev.photos ?? []);
    if (albumChanged) {
      anyAlbumChanged = true;
      await writeFile(
        path.join(DATA_DIR, file),
        JSON.stringify({ album, updatedAt: now, photos }, null, 2)
      );
    }
    console.log(
      `${albumChanged ? "✍" : "="} ${album.padEnd(20)} ${photos.length} photos` +
        ` (${needExtract.length} extracted, ${reusable.length} reused` +
        `${removed.length ? `, ${removed.length} removed` : ""})` +
        (albumChanged ? "" : "  [unchanged, not rewritten]")
    );

    albumSummaries.push({
      album,
      file,
      count: photos.length,
      photoEtagsHash: hash,
      updatedAt: albumChanged ? now : prev.updatedAt,
    });
    allPhotos.push(...photos);
  }

  // Albums that vanished from the bucket entirely.
  const removedAlbums = [...existing.keys()].filter((a) => !byAlbum[a]);
  for (const album of removedAlbums) {
    await unlink(path.join(ALBUMS_DIR, `${album}.json`)).catch(() => {});
    console.log(`✗ ${album} — removed (no longer in bucket)`);
    anyAlbumChanged = true;
  }

  // Master manifest, merged from the per-album data.
  const masterMissing = await readFile(MASTER_PATH).then(() => false, () => true);
  if (anyAlbumChanged || masterMissing) {
    const byLocation = {};
    const ratingHistogram = [0, 0, 0, 0, 0, 0];
    for (const p of allPhotos) {
      byLocation[p.album] = (byLocation[p.album] ?? 0) + 1;
      ratingHistogram[p.rating] += 1;
    }
    await writeFile(
      MASTER_PATH,
      JSON.stringify(
        {
          generatedAt: now,
          totals: { images: allPhotos.length, byLocation, ratingHistogram },
          albums: albumSummaries,
          photos: allPhotos,
        },
        null,
        2
      )
    );
    console.log(`\nWrote ${MASTER_PATH}`);
  } else {
    console.log(`\nNothing changed — ${MASTER_PATH} left untouched.`);
  }

  const failed = allPhotos.filter((p) => p.parseFailed);
  console.log(
    `Totals: ${allPhotos.length} photos in ${albumSummaries.length} albums — ` +
      `${stats.added} added, ${stats.changed} changed, ${stats.reused} reused, ` +
      `${stats.removedPhotos} removed${removedAlbums.length ? `, ${removedAlbums.length} album(s) deleted` : ""}`
  );
  if (failed.length) {
    console.warn(`⚠ ${failed.length} photo(s) failed to parse (will retry next run):`);
    for (const p of failed) console.warn(`  ${p.key}`);
  }
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
