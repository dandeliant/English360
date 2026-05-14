// Level selection — persistence, keyboard navigation, panel toggling.
//
// Markup contract (rendered by Astro components):
//   <article data-lesson-card data-available-levels="A1,A2,B1,B2,C1,C2" data-active-level="B1">
//     <div role="tablist">
//       <button role="tab" data-level="A1" aria-selected="false" aria-controls="panel-A1" tabindex="-1">A1</button>
//       ...
//     </div>
//     <div role="tabpanel" id="panel-A1" data-level-panel="A1" hidden>...</div>
//     ...
//   </article>

const STORAGE_KEY = 'english360.preferred_level';
const DEFAULT_LEVEL = 'B1';
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function readPreferred() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LEVELS.includes(stored)) return stored;
  } catch {
    // localStorage unavailable — fall through to default.
  }
  return DEFAULT_LEVEL;
}

function writePreferred(level) {
  if (!LEVELS.includes(level)) return;
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Best-effort only.
  }
}

function getAvailable(card) {
  return (card.dataset.availableLevels || '').split(',').filter(Boolean);
}

// Pick the best initial level: preferred if available, else nearest available.
function pickInitial(card) {
  const available = getAvailable(card);
  if (available.length === 0) return null;
  const preferred = readPreferred();
  if (available.includes(preferred)) return preferred;

  const preferredIdx = LEVELS.indexOf(preferred);
  let bestLevel = available[0];
  let bestDist = Infinity;
  for (const level of available) {
    const dist = Math.abs(LEVELS.indexOf(level) - preferredIdx);
    if (dist < bestDist) {
      bestDist = dist;
      bestLevel = level;
    }
  }
  return bestLevel;
}

function activate(card, level, opts = {}) {
  if (!LEVELS.includes(level)) return;
  card.dataset.activeLevel = level;

  card.querySelectorAll('[role="tab"]').forEach((tab) => {
    const isActive = tab.dataset.level === level;
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.tabIndex = isActive ? 0 : -1;
  });

  card.querySelectorAll('[data-level-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.levelPanel !== level;
  });

  if (opts.persist !== false) writePreferred(level);

  // Notify any listeners (e.g., TTS to cancel speech when level changes).
  card.dispatchEvent(new CustomEvent('level-changed', { detail: { level } }));
}

function focusActiveTab(card) {
  const active = card.querySelector('[role="tab"][aria-selected="true"]');
  if (active) active.focus();
}

function moveBy(card, delta) {
  const available = getAvailable(card);
  if (available.length === 0) return;
  const current = card.dataset.activeLevel;
  let idx = available.indexOf(current);
  if (idx === -1) idx = 0;
  idx = (idx + delta + available.length) % available.length;
  activate(card, available[idx]);
  focusActiveTab(card);
}

function jumpTo(card, position /* 'first' | 'last' */) {
  const available = getAvailable(card);
  if (available.length === 0) return;
  const target = position === 'last' ? available[available.length - 1] : available[0];
  activate(card, target);
  focusActiveTab(card);
}

function initCard(card) {
  const initial = pickInitial(card);
  if (initial) activate(card, initial, { persist: false });

  card.querySelectorAll('[role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.disabled) return;
      activate(card, tab.dataset.level);
      tab.focus();
    });

    tab.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          moveBy(card, 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          moveBy(card, -1);
          break;
        case 'Home':
          event.preventDefault();
          jumpTo(card, 'first');
          break;
        case 'End':
          event.preventDefault();
          jumpTo(card, 'last');
          break;
      }
    });
  });
}

// Global 1–6 shortcuts: only fire when not typing into a field.
function bindGlobalShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t && t.matches && t.matches('input, textarea, select, [contenteditable="true"]')) return;

    const digit = '123456'.indexOf(event.key);
    if (digit === -1) return;

    const card = document.querySelector('[data-lesson-card]');
    if (!card) return;
    const targetLevel = LEVELS[digit];
    const available = getAvailable(card);
    if (!available.includes(targetLevel)) return;

    event.preventDefault();
    activate(card, targetLevel);
  });
}

function init() {
  document.querySelectorAll('[data-lesson-card]').forEach(initCard);
  bindGlobalShortcuts();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { LEVELS };
