// Dependency-free full-screen lightbox: click a photo → the grid thumbnail
// morphs into the full-screen 2000px derivative (View Transitions API, with
// a plain fade fallback) + EXIF panel. ←/→/Esc keys, focus trap, and a
// deep-linkable #/photo/<id> hash.
const root = document.querySelector('[data-lightbox-root]');
const grid = document.querySelector('[data-grid]');

if (root && grid) {
  // The page we restore the URL to when the lightbox closes
  const basePath = location.pathname + location.search;
  const img = root.querySelector('[data-lb-img]');
  const title = root.querySelector('[data-lb-title]');
  const loc = root.querySelector('[data-lb-loc]');
  const pos = root.querySelector('[data-lb-pos]');
  let current = -1;
  let lastFocus = null;

  const cards = () => Array.from(grid.querySelectorAll('.ph-card:not([hidden])'));

  const pad = (n) => String(n).padStart(2, '0');

  // Run a DOM change inside a view transition when supported.
  function transition(change) {
    if (document.startViewTransition) return document.startViewTransition(change);
    change();
    return null;
  }

  const thumbOf = (card) => card?.querySelector('.ph-frame img');

  function show(i) {
    const list = cards();
    if (!list.length) return;
    current = (i + list.length) % list.length;
    const c = list[current];
    const d = c.dataset;

    img.src = d.full;
    img.srcset = d.fullSrcset || '';
    img.sizes = '(max-width: 720px) 100vw, calc(100vw - 346px)';
    img.alt = `${d.title} — ${d.album}`;
    img.style.setProperty('--ar', c.style.getPropertyValue('--ar'));

    title.textContent = d.title;
    loc.textContent = d.album;
    for (const row of root.querySelectorAll('[data-row]')) {
      const v = d[row.dataset.row] || '';
      row.querySelector('dd').textContent = v;
      row.style.display = v ? '' : 'none';
    }

    const albumLink = root.querySelector('[data-lb-album]');
    albumLink.textContent = d.album;
    albumLink.href = `/albums/${d.albumSlug}/`;

    // Every tag links to its /tags/<tag>/ page (all photos with that tag)
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const tags = (d.tags || '').split(',').filter(Boolean);
    const tagsRow = root.querySelector('[data-lb-tags-row]');
    const tagsDd = root.querySelector('[data-lb-tags]');
    tagsDd.replaceChildren(
      ...tags.map((t) => {
        const a = document.createElement('a');
        a.href = `/tags/${slug(t)}/`;
        a.textContent = t;
        return a;
      })
    );
    tagsRow.style.display = tags.length ? '' : 'none';
    pos.textContent = `${pad(current + 1)} / ${pad(list.length)}`;
    // Real path (a static page exists there), so the URL is shareable and
    // unfurls with the photo if copied while browsing.
    history.replaceState(null, '', `/photo/${d.id}/`);
  }

  function open(i) {
    lastFocus = document.activeElement;
    const thumb = thumbOf(cards()[i]);
    if (thumb) thumb.style.viewTransitionName = 'lb-photo';
    const vt = transition(() => {
      if (thumb) thumb.style.viewTransitionName = '';
      show(i);
      root.hidden = false;
    });
    vt?.finished.finally(() => root.querySelector('[data-lb-close]').focus());
    if (!vt) root.querySelector('[data-lb-close]').focus();
  }

  function close() {
    const thumb = thumbOf(cards()[current]);
    current = -1;
    const vt = transition(() => {
      root.hidden = true;
      if (thumb) thumb.style.viewTransitionName = 'lb-photo';
    });
    vt?.finished.finally(() => {
      if (thumb) thumb.style.viewTransitionName = '';
    });
    history.replaceState(null, '', basePath);
    lastFocus?.focus();
  }

  // Advance the index synchronously — show() runs async inside the view
  // transition, so rapid key presses must not read a stale `current`.
  function step(d) {
    const n = cards().length;
    if (!n) return;
    current = (current + d + n) % n;
    const i = current;
    transition(() => show(i));
  }

  grid.addEventListener('click', (e) => {
    const link = e.target.closest('[data-lightbox]');
    if (!link) return;
    e.preventDefault();
    open(cards().indexOf(link.closest('.ph-card')));
  });

  root.addEventListener('click', (e) => {
    // ✕, or a click on the dark photo pane outside the image, closes
    if (e.target.closest('[data-lb-close]') || e.target.classList.contains('lb-photo')) close();
  });
  root.querySelector('[data-lb-prev]').addEventListener('click', () => step(-1));
  root.querySelector('[data-lb-next]').addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Tab') {
      // Trap focus inside the overlay
      const focusables = root.querySelectorAll('button, a[href]');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Legacy hash deep link (#/photo/<id>) from before static photo pages
  const m = location.hash.match(/^#\/photo\/(.+)$/);
  if (m) {
    const i = cards().findIndex((c) => c.dataset.id === m[1]);
    if (i >= 0) open(i);
  }
}
