import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { BUCKET, RANGE_BYTES, RETRY_RANGE_BYTES, listAllObjects } from "../src/r2.mjs";
import { extractRaw, isImageKey } from "../src/extract.mjs";
import { runPool, extractPhoto, etagsHash, fmtBytes } from "../src/pipeline.mjs";

const OUT_DIR = "out";

const { values: flags } = parseArgs({
  options: {
    prefix: { type: "string" },
    limit: { type: "string" },
  },
});
const limit = flags.limit ? Number(flags.limit) : Infinity;

async function processImage(obj, index) {
  const { row, buffer } = await extractPhoto(obj);

  if (index === 0) {
    console.log(`\n===== RAW exifr OUTPUT (first image: ${obj.key}) =====`);
    try {
      console.dir(await extractRaw(buffer), { depth: null, maxArrayLength: null });
    } catch (err) {
      console.log(`(raw parse failed: ${err.message})`);
    }
    console.log(`===== END RAW OUTPUT =====\n`);
  }

  return row;
}

function printTable(rows) {
  const headers = ["Location", "Filename", "Rating", "WxH", "Date", "#KW", "Keywords"];
  const cells = rows.map((r) => [
    r.album,
    r.filename,
    "★".repeat(r.rating) || "—",
    r.width && r.height ? `${r.width}x${r.height}` : "?",
    r.dateTaken ? r.dateTaken.slice(0, 10) : "—",
    String(r.keywords.length),
    r.keywords.join(", ").slice(0, 60) || "—",
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i].length))
  );
  const line = (row) => row.map((c, i) => c.padEnd(widths[i])).join(" | ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of cells) console.log(line(row));
}

async function main() {
  console.log(`Bucket: ${BUCKET}  (prefix: ${flags.prefix ?? "<all>"}, limit: ${limit === Infinity ? "none" : limit})`);
  console.log(`Partial reads: first ${fmtBytes(RANGE_BYTES)} bytes per image (retry @ ${fmtBytes(RETRY_RANGE_BYTES)})\n`);

  const listed = await listAllObjects(flags.prefix);
  const images = listed.filter(isImageKey).slice(0, limit);
  const skipped = listed.length - listed.filter(isImageKey).length;
  console.log(`Listed ${listed.length} objects → ${images.length} images to process (${skipped} non-image/marker keys skipped)\n`);

  if (images.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const rows = await runPool(images, processImage);
  rows.sort((a, b) => a.key.localeCompare(b.key));

  console.log("");
  printTable(rows);

  // --- Summary ---
  const byLocation = {};
  const histogram = [0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    byLocation[r.album] = (byLocation[r.album] ?? 0) + 1;
    histogram[r.rating] += 1;
  }

  console.log(`\nTotal images: ${rows.length}`);
  console.log("Per location:");
  for (const [loc, n] of Object.entries(byLocation).sort()) {
    console.log(`  ${loc.padEnd(20)} ${n}`);
  }
  console.log("Rating distribution:");
  const maxBar = Math.max(...histogram, 1);
  histogram.forEach((n, stars) => {
    const bar = "▇".repeat(Math.round((n / maxBar) * 30));
    console.log(`  ${stars}★ ${String(n).padStart(3)} ${bar}`);
  });

  const retried = rows.filter((r) => r.neededRetry);
  console.log(
    retried.length
      ? `\n${retried.length} image(s) needed the ${fmtBytes(RETRY_RANGE_BYTES)}-byte bump:\n` +
          retried.map((r) => `  ${r.key}${r.parseFailed ? "  (still failed!)" : ""}`).join("\n")
      : `\nAll images parsed within the first ${fmtBytes(RANGE_BYTES)} bytes — RANGE_BYTES looks well-set.`
  );

  // --- JSON output: one file per album + a master built from them ---
  const generatedAt = new Date().toISOString();
  await mkdir(path.join(OUT_DIR, "albums"), { recursive: true });

  const albums = [];
  for (const [album, photos] of Object.entries(
    Object.groupBy(rows, (r) => r.album)
  ).sort()) {
    const file = path.join("albums", `${album}.json`);
    await writeFile(
      path.join(OUT_DIR, file),
      JSON.stringify({ album, generatedAt, photos }, null, 2)
    );
    albums.push({ album, file, count: photos.length, photoEtagsHash: etagsHash(photos), photos });
  }

  const master = {
    generatedAt,
    totals: { images: rows.length, byLocation, ratingHistogram: histogram },
    albums: albums.map(({ photos, ...a }) => a),
    photos: albums.flatMap((a) => a.photos),
  };
  await writeFile(
    path.join(OUT_DIR, "test-extract.json"),
    JSON.stringify(master, null, 2)
  );

  console.log(`\nWrote ${albums.map((a) => `${OUT_DIR}/${a.file}`).join(", ")}`);
  console.log(`Wrote ${OUT_DIR}/test-extract.json (master, merged from per-album JSONs)`);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
