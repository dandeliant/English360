// Text-to-speech via Web Speech API.
//
// - Cascading voice selection: prefer UK English (female if possible).
// - Async voice loading: getVoices() is empty on first call in Chromium,
//   so we wait for `voiceschanged` AND fall back to a short poll.
// - Single active utterance; clicking the same button again cancels.
// - Space toggles the "main" button inside the currently active level panel.
// - Changing level cancels any current speech.
//
// Markup contract (rendered by TTSButton.astro):
//   <button data-tts data-tts-text="..." [data-tts-main] [data-tts-rate="0.9"]>

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

let _voicesPromise = null;
let _currentUtterance = null;
let _activeButton = null;

function loadVoices() {
  if (!synth) return Promise.resolve([]);
  if (_voicesPromise) return _voicesPromise;

  _voicesPromise = new Promise((resolve) => {
    const immediate = synth.getVoices();
    if (immediate && immediate.length) {
      resolve(immediate);
      return;
    }
    // Chromium populates voices asynchronously.
    const onChange = () => {
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', onChange);
    // Safari sometimes never fires `voiceschanged`; poll briefly as a backup.
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

export function cancel() {
  if (!synth) return;
  synth.cancel();
  _currentUtterance = null;
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

  utterance.onend = () => {
    if (_currentUtterance === utterance) {
      _currentUtterance = null;
      markIdle(_activeButton);
      _activeButton = null;
    }
  };
  utterance.onerror = (event) => {
    if (event.error === 'interrupted' || event.error === 'canceled') return;
    if (_currentUtterance === utterance) {
      _currentUtterance = null;
      markIdle(_activeButton);
      _activeButton = null;
    }
  };

  _currentUtterance = utterance;
  synth.speak(utterance);
}

function handleButtonActivation(btn) {
  const text = btn.dataset.ttsText || '';
  if (!text) return;

  // Toggle off if this button is the one currently playing.
  if (_activeButton === btn && synth && synth.speaking) {
    cancel();
    return;
  }

  markIdle(_activeButton);
  _activeButton = btn;
  markActive(btn);

  const rate = parseFloat(btn.dataset.ttsRate || '');
  speak(text, { rate: Number.isFinite(rate) ? rate : undefined });
}

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

    const target = event.target;
    if (target && target.matches && target.matches('input, textarea, select, button, [contenteditable="true"]')) return;

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
  // Preload voices so the first click feels instant.
  loadVoices();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
