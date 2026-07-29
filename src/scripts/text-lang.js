// Text-language switcher (EN ⇄ PL) for lesson content.
//
// - State lives on <html data-text-lang="en|pl"> (set early by an inline
//   script in BaseLayout to avoid flash of wrong language).
// - Persisted in localStorage as `english360.text_lang`.
// - CSS in global.css hides the inactive language container based on the
//   <html> attribute, and hides the main TTS button when PL is active
//   (English voices read Polish poorly).
// - Switching to PL cancels any in-flight TTS so the audio does not
//   contradict the visible text.

import { cancel as cancelTts } from './tts.js';

const STORAGE_KEY = 'english360.text_lang';
const VALID = new Set(['en', 'pl', 'parallel']);

export function getTextLang() {
  const v = document.documentElement.dataset.textLang;
  if (v === 'pl') return 'pl';
  if (v === 'parallel') return 'parallel';
  return 'en';
}

export function setTextLang(lang) {
  if (!VALID.has(lang)) return;
  const prev = document.documentElement.dataset.textLang;
  if (prev === lang) return;
  document.documentElement.dataset.textLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Best-effort persistence.
  }
  syncToggles(lang);
  // Cancel any in-flight speech on switch — the playing voice may no
  // longer match the visible text (e.g. PL audio while only EN is shown).
  cancelTts();
}

function syncToggles(lang) {
  document.querySelectorAll('[data-text-lang-toggle]').forEach((btn) => {
    btn.setAttribute('aria-checked', btn.dataset.lang === lang ? 'true' : 'false');
  });
}

function init() {
  syncToggles(getTextLang());
  document.querySelectorAll('[data-text-lang-toggle]').forEach((btn) => {
    if (btn.dataset.textLangBound === 'true') return;
    btn.dataset.textLangBound = 'true';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setTextLang(btn.dataset.lang);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
