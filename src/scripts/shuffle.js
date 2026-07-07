// Home-grid shuffle (Fisher–Yates, per visit) + infinite-scroll batching.
// The grid is server-rendered complete and in stable order, so no-JS
// visitors get everything; this island only reorders and staggers reveal.
const BATCH = 24;

const grid = document.querySelector('[data-grid]');
if (grid) {
  const cards = Array.from(grid.children);

  if (grid.hasAttribute('data-shuffle')) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    grid.append(...cards); // row spans travel with each node
  }

  const sentinel = document.querySelector('[data-sentinel]');
  if (sentinel && cards.length > BATCH) {
    let shown = BATCH;
    cards.slice(BATCH).forEach((c) => (c.hidden = true));
    sentinel.classList.add('active');
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        cards.slice(shown, shown + BATCH).forEach((c) => (c.hidden = false));
        shown += BATCH;
        if (shown >= cards.length) {
          sentinel.classList.remove('active');
          io.disconnect();
        }
      },
      { rootMargin: '600px' }
    );
    io.observe(sentinel);
  }
}
