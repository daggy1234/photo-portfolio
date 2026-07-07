// Server-side masonry math.
//
// The grid uses `grid-auto-rows: calc(column-width / SCALE)` — the row unit
// is proportional to the column width (via container-query units), so a span
// computed once from the aspect ratio holds at every viewport width:
//   image height = colw / ratio = (SCALE / ratio) rows
// CAPTION_UNITS rows are added for the caption strip + inter-card gap
// (colw * 7/48 ≈ 41–53px across real column widths; caption content is
// ~28px, the remainder is the visual gap the design draws at 18px).
// Rounding error is ≤ half a row unit (~3px), absorbed by that gap.

export const SCALE = 48;
export const CAPTION_UNITS = 7;

// Landscape photos span 2 columns so they hold their own against portraits.
// Their rendered width is 2·colw + gap; 16px gap ≈ 0.047 colw at real column
// widths, folded into the factor (residual error < half a row unit).
const WIDE_FACTOR = 2.047;

export function isWide(ratio) {
  return ratio > 1;
}

export function rowSpan(ratio) {
  return Math.round(SCALE / ratio) + CAPTION_UNITS;
}

export function rowSpanWide(ratio) {
  return Math.round((SCALE * WIDE_FACTOR) / ratio) + CAPTION_UNITS;
}
