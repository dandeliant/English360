// Admin form save handler.
//
// Each admin lesson form embeds the full initial lesson JSON in a
// <script type="application/json" data-initial-data> tag. On submit we
// parse the named fields, deep-merge them over the initial data, and
// POST the result to /api/admin/save-lesson. The endpoint only exists
// while `npm run dev` is running — production returns 404 and we show
// the failure inline.

function parseCommaList(input) {
  return input
    .split(/[,]+/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
}

function parseHashtags(input) {
  return input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
}

function parseLines(input) {
  return input
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function setNested(target, path, value) {
  const parts = path.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function readInitialData(form) {
  const el = form.querySelector('[data-initial-data]');
  if (!el) throw new Error('Initial data missing on form');
  try {
    return JSON.parse(el.textContent || '{}');
  } catch (err) {
    throw new Error(`Could not parse initial data: ${err.message}`);
  }
}

function collectFormPatch(form) {
  const patch = {};
  for (const el of form.querySelectorAll('input[name], textarea[name], select[name]')) {
    if (el.readOnly || el.disabled) continue;
    const name = el.name;
    const raw = el.value;
    let value = raw;

    if (name === 'tags' || name === 'themes') {
      value = parseCommaList(raw);
    } else if (name === 'date_alternatives') {
      value = parseLines(raw);
    } else if (name === 'social.hashtags') {
      value = parseHashtags(raw);
    } else if (typeof raw === 'string') {
      value = raw.trim();
    }

    setNested(patch, name, value);
  }
  return patch;
}

function deepMerge(target, source) {
  // Returns a new object — does not mutate target.
  if (Array.isArray(source)) return source.slice();
  if (source && typeof source === 'object') {
    const out = { ...(target && typeof target === 'object' && !Array.isArray(target) ? target : {}) };
    for (const [k, v] of Object.entries(source)) {
      out[k] = deepMerge(out[k], v);
    }
    return out;
  }
  return source;
}

function setStatus(form, text, tone) {
  const status = form.querySelector('[data-status]');
  if (!status) return;
  status.textContent = text;
  if (tone) status.dataset.tone = tone;
  else delete status.dataset.tone;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saveBtn = form.querySelector('[data-action="save"]');

  let initial;
  try {
    initial = readInitialData(form);
  } catch (err) {
    setStatus(form, `✗ ${err.message}`, 'error');
    return;
  }

  const patch = collectFormPatch(form);
  const merged = deepMerge(initial, patch);
  merged.id = form.dataset.lessonId; // canonical

  saveBtn.disabled = true;
  setStatus(form, 'Zapisuję…', '');

  try {
    const res = await fetch('/api/admin/save-lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: merged.id, data: merged }),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      // not JSON — probably 404 HTML from production
    }
    if (!res.ok) {
      const detail = body?.error || `HTTP ${res.status}`;
      throw new Error(detail.includes('404') ? 'Endpoint nie istnieje (produkcja?)' : detail);
    }
    setStatus(form, `✓ Zapisano: ${body.path} (${body.bytes} B)`, 'success');

    // Refresh the embedded snapshot + JSON preview so subsequent edits
    // start from the now-saved state.
    const initEl = form.querySelector('[data-initial-data]');
    if (initEl) initEl.textContent = JSON.stringify(merged);
    const preview = form.querySelector('[data-json-preview]');
    if (preview) preview.textContent = JSON.stringify(merged, null, 2);
  } catch (err) {
    setStatus(form, `✗ Błąd: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

function init() {
  document.querySelectorAll('[data-admin-form]').forEach((form) => {
    if (form.dataset.adminFormBound === 'true') return;
    form.dataset.adminFormBound = 'true';
    form.addEventListener('submit', handleSubmit);
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
