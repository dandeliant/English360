// Theme management — light/dark with localStorage persistence.
//
// The initial `data-theme` attribute is set by an inline script in <head>
// BEFORE CSS parses, so there is no flash of incorrect theme. This module
// only handles user toggling after first paint and keeps button state in sync.

const STORAGE_KEY = 'english360.theme';

export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable (private mode, etc.) — preference is
    // session-only in that case; visual state still updates.
  }
  syncToggles(theme);
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function syncToggles(theme) {
  const isDark = theme === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    const next = isDark ? btn.dataset.labelDark : btn.dataset.labelLight;
    if (next) btn.setAttribute('aria-label', next);
  });
}

function init() {
  syncToggles(getTheme());
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', toggleTheme);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Track system preference changes when the user has not picked explicitly.
try {
  if (!localStorage.getItem(STORAGE_KEY)) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
      syncToggles(getTheme());
    });
  }
} catch {
  // Ignore — older browsers without matchMedia or addEventListener on MQL.
}
