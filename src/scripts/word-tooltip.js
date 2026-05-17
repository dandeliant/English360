// Floating Polish-translation tooltip for clickable words.
//
// Architecture: ONE tooltip DOM node, document-level delegation. Hover (or
// keyboard focus) on any `.word-link[data-pl]` reveals the tooltip; moving
// away or scrolling hides it. Positioning flips below the word if there is
// no space above and clamps horizontally so the tooltip never overflows
// the viewport. Touch devices (no hover) trigger only on focus.

let tooltip = null;
let lastTarget = null;

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.className = 'word-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltip);
  return tooltip;
}

function show(target) {
  const pl = target.dataset.pl;
  if (!pl) return;
  if (target === lastTarget) {
    position(target);
    return;
  }
  const tip = ensureTooltip();
  tip.textContent = pl;
  // Make it measurable first (off-screen), then position.
  tip.dataset.visible = 'true';
  tip.setAttribute('aria-hidden', 'false');
  lastTarget = target;
  position(target);
}

function hide() {
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
  if (link && link.dataset.pl) {
    show(link);
  }
}

function onMouseOut(event) {
  if (!event.target.closest) return;
  const link = event.target.closest('.word-link');
  if (!link) return;
  // Don't hide if we're crossing into another word-link.
  const next =
    event.relatedTarget &&
    event.relatedTarget.closest &&
    event.relatedTarget.closest('.word-link');
  if (next && next.dataset.pl) return;
  hide();
}

function onFocusIn(event) {
  const link = event.target.closest && event.target.closest('.word-link');
  if (link && link.dataset.pl) show(link);
}

function onFocusOut() {
  hide();
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
