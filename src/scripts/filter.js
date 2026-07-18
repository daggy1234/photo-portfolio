// Tag filter: builds toggle buttons from the tags that actually exist on the
// page. Keywords are mostly unpopulated today, so with no tags this renders
// nothing at all.
const bar = document.querySelector('[data-filter-bar]');
const cards = Array.from(document.querySelectorAll('.ph-card'));

const tags = [...new Set(cards.flatMap((c) => (c.dataset.tags || '').split(',').filter(Boolean)))].sort();

if (bar && tags.length) {
  bar.classList.add('has-tags');
  const activeTags = new Set();

  const apply = () => {
    for (const card of cards) {
      const cardTags = (card.dataset.tags || '').split(',');
      card.hidden = activeTags.size > 0 && ![...activeTags].every((t) => cardTags.includes(t));
    }
    document.querySelector('[data-grid]')?.dispatchEvent(new CustomEvent('gallery:change'));
  };

  for (const tag of tags) {
    const btn = document.createElement('button');
    btn.textContent = tag;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      activeTags.has(tag) ? activeTags.delete(tag) : activeTags.add(tag);
      btn.setAttribute('aria-pressed', String(activeTags.has(tag)));
      apply();
    });
    bar.append(btn);
  }
}
