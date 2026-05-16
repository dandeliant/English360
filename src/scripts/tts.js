// Text-to-speech via Web Speech API.
//
// Features:
// - Cascading voice pick (prefers UK English, female if available).
// - Async voice loading via `voiceschanged` + timeout fallback (for Chromium/Safari).
// - Single active utterance; clicking the same button again cancels.
// - Space toggles the "main" button in the currently active level panel.
// - Changing level cancels current speech.
// - Word-by-word highlighting in the source paragraph, driven by SpeechSynthesisUtterance.onboundary.
//   The active word gets `.tts-word.is-active` for styling.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

let _voicesPromise = null;
let _currentUtterance = null;
let _activeButton = null;
let _activeTarget = null;

// ── Voice loading ──────────────────────────────────────────────────────────

function loadVoices() {
  if (!synth) return Promise.resolve([]);
  if (_voicesPromise) return _voicesPromise;

  _voicesPromise = new Promise((resolve) => {
    const immediate = synth.getVoices();
    if (immediate && immediate.length) {
      resolve(immediate);
      return;
    }
    const onChange = () => {
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', onChange);
    setTimeout(() => {
      const v = synth.getVoices();
      if (v && v.length) {
        synth.removeEventListener('voiceschanged', onChange);
        resolve(v);
      }
    }, 400);
  });

  return _voicesPromise;
}

function pickVoice(voices) {
  return (
    voices.find((v) => v.name === 'Google UK English Female') ||
    voices.find((v) => v.name.includes('Google') && v.lang === 'en-GB') ||
    voices.find((v) => v.lang === 'en-GB') ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) ||
    voices[0] ||
    null
  );
}

// ── Button state ───────────────────────────────────────────────────────────

function markActive(btn) {
  if (!btn) return;
  btn.dataset.ttsPlaying = 'true';
  btn.setAttribute('aria-pressed', 'true');
}

function markIdle(btn) {
  if (!btn) return;
  btn.dataset.ttsPlaying = 'false';
  btn.setAttribute('aria-pressed', 'false');
}

// ── Word wrapping & highlighting ───────────────────────────────────────────

// Look up the highlight target for a button. Main buttons highlight the
// EN paragraph(s) inside their panel — the PL container is also in the
// DOM but hidden via CSS when text-lang is `en`, so target it directly.
function getHighlightTarget(btn) {
  if (!btn || btn.dataset.ttsMain !== 'true') return null;
  const panel = btn.closest('[data-level-panel]');
  if (!panel) return null;
  return panel.querySelector('[data-text-lang-content="en"]');
}

// Wrap every word in the container with <span class="tts-word">…</span>.
// Idempotent — runs at most once per container.
function wrapWords(container) {
  if (!container || container.dataset.ttsWrapped === 'true') return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text nodes that already live inside .tts-word.
      if (node.parentElement && node.parentElement.classList.contains('tts-word')) {
        return NodeFilter.FILTER_REJECT;
      }
      return /\S/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  const wordRe = /\S+/g;
  for (const tn of textNodes) {
    const text = tn.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = wordRe.exec(text))) {
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      const span = document.createElement('span');
      span.className = 'tts-word';
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    tn.parentNode.replaceChild(frag, tn);
    wordRe.lastIndex = 0;
  }

  container.dataset.ttsWrapped = 'true';
}

function clearActiveWord(container) {
  if (!container) return;
  container.querySelectorAll('.tts-word.is-active').forEach((el) =>
    el.classList.remove('is-active'),
  );
}

// Find the .tts-word that covers `charIndex` in the container's textContent,
// then add `.is-active`. Walks text nodes in document order, summing offsets.
function highlightWordAt(container, charIndex) {
  if (!container) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let target = null;
  let n;
  while ((n = walker.nextNode())) {
    const len = n.nodeValue.length;
    if (charIndex >= pos && charIndex < pos + len) {
      const parent = n.parentElement;
      if (parent && parent.classList.contains('tts-word')) target = parent;
      break;
    }
    pos += len;
  }

  if (!target) return;
  clearActiveWord(container);
  target.classList.add('is-active');

  // Keep the active word in view if the page has scrolled past it.
  if (target.getBoundingClientRect) {
    const rect = target.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 40) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function cancel() {
  if (!synth) return;
  synth.cancel();
  if (_activeTarget) clearActiveWord(_activeTarget);
  _currentUtterance = null;
  _activeTarget = null;
  markIdle(_activeButton);
  _activeButton = null;
}

export async function speak(text, opts = {}) {
  if (!synth || !text || !text.trim()) return;
  synth.cancel();

  const voices = await loadVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(voices);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || 'en-GB';
  } else {
    utterance.lang = 'en-GB';
  }
  utterance.rate = opts.rate ?? 0.95;
  utterance.pitch = opts.pitch ?? 1;
  utterance.volume = opts.volume ?? 1;

  const target = opts.target || null;

  if (target) {
    utterance.onboundary = (event) => {
      if (event.name && event.name !== 'word') return;
      // Some engines fire boundary with charIndex past text length; guard.
      if (typeof event.charIndex !== 'number') return;
      highlightWordAt(target, event.charIndex);
    };
  }

  utterance.onend = () => {
    if (_currentUtterance === utterance) {
      if (_activeTarget) clearActiveWord(_activeTarget);
      _currentUtterance = null;
      _activeTarget = null;
      markIdle(_activeButton);
      _activeButton = null;
    }
  };

  utterance.onerror = (event) => {
    if (event.error === 'interrupted' || event.error === 'canceled') return;
    if (_currentUtterance === utterance) {
      if (_activeTarget) clearActiveWord(_activeTarget);
      _currentUtterance = null;
      _activeTarget = null;
      markIdle(_activeButton);
      _activeButton = null;
    }
  };

  _currentUtterance = utterance;
  _activeTarget = target;
  synth.speak(utterance);
}

// ── Button activation ──────────────────────────────────────────────────────

function handleButtonActivation(btn) {
  const target = getHighlightTarget(btn);
  let text;
  if (target) {
    wrapWords(target);
    // After wrapping, textContent is unchanged but now spans the .tts-word elements.
    text = target.textContent;
  } else {
    text = btn.dataset.ttsText || '';
  }
  if (!text || !text.trim()) return;

  if (_activeButton === btn && synth && synth.speaking) {
    cancel();
    return;
  }

  markIdle(_activeButton);
  if (_activeTarget && _activeTarget !== target) clearActiveWord(_activeTarget);

  _activeButton = btn;
  markActive(btn);

  const rate = parseFloat(btn.dataset.ttsRate || '');
  speak(text, {
    rate: Number.isFinite(rate) ? rate : undefined,
    target,
  });
}

// ── Wiring ─────────────────────────────────────────────────────────────────

function bindButtons(root = document) {
  root.querySelectorAll('[data-tts]').forEach((btn) => {
    if (btn.dataset.ttsBound === 'true') return;
    btn.dataset.ttsBound = 'true';
    btn.addEventListener('click', () => handleButtonActivation(btn));
  });
}

function bindSpaceShortcut() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.code !== 'Space') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const t = event.target;
    if (t && t.matches && t.matches('input, textarea, select, button, [contenteditable="true"]')) return;

    // TTS is EN-only — bail if the user has switched the text to PL.
    if (document.documentElement.dataset.textLang === 'pl') return;

    const card = document.querySelector('[data-lesson-card]');
    if (!card) return;
    const level = card.dataset.activeLevel;
    if (!level) return;
    const panel = card.querySelector(`[data-level-panel="${level}"]`);
    if (!panel || panel.hidden) return;
    const main = panel.querySelector('[data-tts][data-tts-main]');
    if (!main) return;

    event.preventDefault();
    handleButtonActivation(main);
  });
}

function bindLevelChangeCancel() {
  document.querySelectorAll('[data-lesson-card]').forEach((card) => {
    card.addEventListener('level-changed', () => cancel());
  });
}

function init() {
  if (!synth) return;
  bindButtons();
  bindSpaceShortcut();
  bindLevelChangeCancel();
  window.addEventListener('beforeunload', cancel);
  loadVoices();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
