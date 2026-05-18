// Wires every [data-star-btn] on the page to the vocab state module:
//   - reflects starred state on load and after every state change
//   - toggles state on click
//   - updates the aria-pressed + label, so screen readers track changes
//
// One subscription per page keeps DOM in sync across multiple star buttons
// pointing at the same slug (e.g. one in the lesson vocab table, one on the
// dictionary word page).

import { isStarred, toggleStar, onChange } from './vocab-state.js';

const ARIA_LABEL_OFF = 'Dodaj do ulubionych słówek';
const ARIA_LABEL_ON = 'Usuń z ulubionych słówek';

function syncOne(btn) {
  const slug = btn.dataset.slug;
  if (!slug) return;
  const on = isStarred(slug);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? ARIA_LABEL_ON : ARIA_LABEL_OFF);
}

function syncAll() {
  document.querySelectorAll('[data-star-btn]').forEach(syncOne);
}

function bindOne(btn) {
  if (btn.dataset.starBound === 'true') return;
  btn.dataset.starBound = 'true';
  btn.addEventListener('click', () => {
    const slug = btn.dataset.slug;
    if (!slug) return;
    toggleStar(slug, { lessonId: btn.dataset.lessonId });
    // syncOne will be triggered via the change subscription
  });
}

function init() {
  document.querySelectorAll('[data-star-btn]').forEach((btn) => {
    bindOne(btn);
    syncOne(btn);
  });
  // Reflect every state change in every star on the page.
  onChange(syncAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
