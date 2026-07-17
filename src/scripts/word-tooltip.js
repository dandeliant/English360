// Floating tooltip for clickable words: British TTS speaker, a star to add
// the word to favourites, IPA and the Polish translation.
//
// Architecture: ONE tooltip DOM node, document-level delegation. Hover (or
// keyboard focus) on any `.word-link` reveals the tooltip. It carries a real
// 🔊 button that speaks the hovered word via the shared TTS engine (which
// already prefers a British "Google UK English" voice), a ☆/★ button that
// toggles the word in the personal vocab journal, plus the word's IPA and
// Polish gloss when the dictionary has them.
//
// The tooltip is interactive (`pointer-events: auto`) so the buttons are
// clickable. A short hide delay bridges the gap between the word and the
// tooltip so the pointer can travel onto it without it vanishing. Positioning
// flips below the word when there is no room above and clamps horizontally so
// the tooltip never overflows the viewport. Touch devices (no hover) trigger
// only on focus.
//
// Keyboard/AA note: focusing a word shows the same IPA + PL info. Keyboard-
// operable per-word audio and starring live on the word's own dictionary page
// (the in-flow `[data-tts]` 🔊 button and the `[data-star-btn]` star in the
// header), both in the tab order; the tooltip's buttons are pointer
// enhancements that duplicate them.

import { speak } from './tts.js';
import { toggleStar, isStarred, onChange } from './vocab-state.js';

const STAR_LABEL_OFF = 'Dodaj do ulubionych słówek';
const STAR_LABEL_ON = 'Usuń z ulubionych słówek';

let tooltip = null;
let speakBtn = null;
let starBtn = null;
let ipaEl = null;
let plEl = null;
let lastTarget = null;
let currentWord = '';
let currentSlug = '';
let currentLessonId = '';
let hideTimer = null;

function ensureTooltip() {
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.className = 'word-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');

  const row = document.createElement('div');
  row.className = 'word-tooltip__row';

  speakBtn = document.createElement('button');
  speakBtn.type = 'button';
  speakBtn.className = 'word-tooltip__speak';
  speakBtn.setAttribute('aria-label', 'Odsłuchaj wymowę');
  speakBtn.textContent = '🔊';
  speakBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (currentWord) speak(currentWord, { lang: 'en' });
  });

  starBtn = document.createElement('button');
  starBtn.type = 'button';
  starBtn.className = 'word-tooltip__star';
  starBtn.setAttribute('aria-pressed', 'false');
  starBtn.setAttribute('aria-label', STAR_LABEL_OFF);
  starBtn.textContent = '☆';
  starBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!currentSlug) return;
    toggleStar(currentSlug, currentLessonId ? { lessonId: currentLessonId } : {});
    reflectStar();
  });

  ipaEl = document.createElement('span');
  ipaEl.className = 'word-tooltip__ipa';

  plEl = document.createElement('span');
  plEl.className = 'word-tooltip__pl';

  row.append(speakBtn, starBtn, ipaEl);
  tooltip.append(row, plEl);
  document.body.appendChild(tooltip);

  // Keep the tooltip alive while the pointer is over it.
  tooltip.addEventListener('mouseover', cancelHide);
  tooltip.addEventListener('mouseleave', scheduleHide);

  // Reflect starred-state changes made elsewhere (word page, vocab table)
  // while the tooltip is open for the same word.
  onChange(() => {
    if (lastTarget) reflectStar();
  });

  return tooltip;
}

function reflectStar() {
  if (!starBtn) return;
  const on = Boolean(currentSlug) && isStarred(currentSlug);
  starBtn.textContent = on ? '★' : '☆';
  starBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  starBtn.setAttribute('aria-label', on ? STAR_LABEL_ON : STAR_LABEL_OFF);
  starBtn.dataset.on = on ? 'true' : 'false';
}

function cancelHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide() {
  cancelHide();
  // Delay long enough to cross the small gap between word and tooltip.
  hideTimer = setTimeout(hide, 150);
}

function slugOfLink(target) {
  if (target.dataset.slug) return target.dataset.slug;
  // Fallback: last path segment of the /slownik/<slug> href.
  try {
    return new URL(target.href).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return '';
  }
}

function show(target) {
  cancelHide();
  const pl = target.dataset.pl || '';
  const ipa = target.dataset.ipa || '';
  currentWord = (target.textContent || '').trim();
  currentSlug = slugOfLink(target);
  currentLessonId = target.dataset.lessonId || '';

  const tip = ensureTooltip();
  reflectStar();

  if (ipa) {
    ipaEl.textContent = ipa;
    ipaEl.hidden = false;
  } else {
    ipaEl.textContent = '';
    ipaEl.hidden = true;
  }

  if (pl) {
    plEl.textContent = pl;
    plEl.hidden = false;
  } else {
    plEl.textContent = '';
    plEl.hidden = true;
  }

  // Make it measurable first, then position.
  tip.dataset.visible = 'true';
  tip.setAttribute('aria-hidden', 'false');
  lastTarget = target;
  position(target);
}

function hide() {
  cancelHide();
  if (!tooltip || !lastTarget) return;
  tooltip.dataset.visible = 'false';
  tooltip.setAttribute('aria-hidden', 'true');
  lastTarget = null;
}

function position(target) {
  if (!tooltip) return;
  const margin = 8;
  const tr = target.getBoundingClientRect();
  const tt = tooltip.getBoundingClientRect();

  // Default: above the word.
  let top = tr.top - tt.height - margin;
  let arrow = 'bottom';
  if (top < margin) {
    // Not enough room above — flip below.
    top = tr.bottom + margin;
    arrow = 'top';
  }

  // Center horizontally on the word, then clamp to viewport.
  const wordCenter = tr.left + tr.width / 2;
  let left = wordCenter - tt.width / 2;
  const minLeft = margin;
  const maxLeft = window.innerWidth - tt.width - margin;
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;

  // Arrow x position relative to tooltip's left edge, clamped to tooltip width.
  let arrowX = wordCenter - left;
  if (arrowX < 12) arrowX = 12;
  if (arrowX > tt.width - 12) arrowX = tt.width - 12;

  tooltip.style.left = `${left + window.scrollX}px`;
  tooltip.style.top = `${top + window.scrollY}px`;
  tooltip.style.setProperty('--arrow-x', `${arrowX}px`);
  tooltip.dataset.arrow = arrow;
}

function onMouseOver(event) {
  const link = event.target.closest && event.target.closest('.word-link');
  if (link) show(link);
}

function onMouseOut(event) {
  if (!event.target.closest) return;
  const link = event.target.closest('.word-link');
  if (!link) return;
  const next =
    event.relatedTarget &&
    event.relatedTarget.closest &&
    event.relatedTarget.closest('.word-link, .word-tooltip');
  // Moving into another word or onto the tooltip itself keeps it open.
  if (next) return;
  scheduleHide();
}

function onFocusIn(event) {
  const link = event.target.closest && event.target.closest('.word-link');
  if (link) show(link);
}

function onFocusOut() {
  scheduleHide();
}

function init() {
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
