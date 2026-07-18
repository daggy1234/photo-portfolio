// Home-grid shuffle plus exact justified-row layout. The server-rendered flex
// layout is a no-JS fallback; this enhancement partitions the cards into
// explicit rows so every desktop row fills the container at one shared height.
const GAP = 16;
const MAX_PER_ROW = 8;
const MOBILE_BREAKPOINT = 655;

const grid = document.querySelector('[data-grid]');
if (grid) {
  const cards = Array.from(grid.children);

  if (grid.hasAttribute('data-shuffle')) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    grid.append(...cards);
  }

  const ratio = (card) => Number.parseFloat(card.dataset.ratio || '1') || 1;

  const targetHeight = (width) => Math.min(380, Math.max(280, width / 4.8));

  // Dynamic programming keeps the final row balanced with the rows before it,
  // rather than leaving a sparse strip or stretching one portrait enormously.
  const partition = (visible, width) => {
    if (visible.length <= 1) return visible.length ? [visible] : [];

    const target = targetHeight(width);
    const count = visible.length;
    const cost = Array(count + 1).fill(Number.POSITIVE_INFINITY);
    const next = Array(count).fill(0);
    cost[count] = 0;

    for (let start = count - 1; start >= 0; start -= 1) {
      const minimum = count === 1 ? 1 : 2;
      for (let length = minimum; length <= MAX_PER_ROW && start + length <= count; length += 1) {
        const sum = visible
          .slice(start, start + length)
          .reduce((total, card) => total + ratio(card), 0);
        const height = (width - GAP * (length - 1)) / sum;
        const deviation = Math.log(height / target);
        const tooShort = Math.max(0, 220 - height) / target;
        const tooTall = Math.max(0, height - 520) / target;
        const rowCost = deviation ** 2 + 6 * tooShort ** 2 + 8 * tooTall ** 2;
        const candidate = rowCost + cost[start + length];

        if (candidate < cost[start]) {
          cost[start] = candidate;
          next[start] = length;
        }
      }
    }

    const rows = [];
    for (let start = 0; start < count; start += next[start]) {
      const length = next[start] || count - start;
      rows.push(visible.slice(start, start + length));
    }
    return rows;
  };

  let lastWidth = -1;
  let frame = 0;

  const layout = (force = false) => {
    const width = grid.clientWidth;
    if (!force && Math.abs(width - lastWidth) < 1) return;
    lastWidth = width;

    const visible = cards.filter((card) => !card.hidden);
    const hidden = cards.filter((card) => card.hidden);
    const fragment = document.createDocumentFragment();

    if (width <= MOBILE_BREAKPOINT) {
      grid.classList.remove('is-justified');
      fragment.append(...visible, ...hidden);
    } else {
      grid.classList.add('is-justified');
      for (const rowCards of partition(visible, width)) {
        const row = document.createElement('div');
        row.className = 'photo-row';
        row.append(...rowCards);
        fragment.append(row);
      }
      fragment.append(...hidden);
    }

    grid.replaceChildren(fragment);
  };

  const scheduleLayout = (force = false) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => layout(force));
  };

  layout(true);
  new ResizeObserver(() => scheduleLayout()).observe(grid);
  grid.addEventListener('gallery:change', () => scheduleLayout(true));

  // Fonts can slightly change caption geometry without changing grid width.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => scheduleLayout(true));
  }
}
