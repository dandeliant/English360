// Admin dictionary translations editor.
//
// Each /admin/slownik/[word] page renders a list of <div data-translation-row>
// inside [data-translations-list]. This script:
//  - wires up add / remove / move-up / move-down per row
//  - on submit, collects values into a string[] and POSTs to
//    /api/admin/save-translations
//
// Empty rows are silently dropped. The order of rows IS the canonical order
// — first row becomes the primary translation (rendered in headers and at
// the front of the tooltip list).

function setStatus(form, text, tone) {
  const status = form.querySelector('[data-status]');
  if (!status) return;
  status.textContent = text;
  if (tone) status.dataset.tone = tone;
  else delete status.dataset.tone;
}

function collectTranslations(form) {
  const rows = form.querySelectorAll('[data-translation-row]');
  return [...rows]
    .map((row) => row.querySelector('[data-field="value"]')?.value || '')
    .map((v) => v.trim())
    .filter(Boolean);
}

function makeRowFromTemplate(form) {
  const tmpl = form.querySelector('[data-translation-template]');
  if (!tmpl) return null;
  return tmpl.content.firstElementChild.cloneNode(true);
}

function bindRowControls(form) {
  form.addEventListener('click', (event) => {
    const t = event.target;
    if (!t || !t.closest) return;

    const removeBtn = t.closest('[data-remove-translation]');
    if (removeBtn) {
      const row = removeBtn.closest('[data-translation-row]');
      if (row) row.remove();
      return;
    }

    const upBtn = t.closest('[data-move-up]');
    if (upBtn) {
      const row = upBtn.closest('[data-translation-row]');
      const prev = row?.previousElementSibling;
      if (row && prev) row.parentNode.insertBefore(row, prev);
      return;
    }

    const downBtn = t.closest('[data-move-down]');
    if (downBtn) {
      const row = downBtn.closest('[data-translation-row]');
      const next = row?.nextElementSibling;
      if (row && next) row.parentNode.insertBefore(next, row);
      return;
    }

    const addBtn = t.closest('[data-add-translation]');
    if (addBtn) {
      const list = form.querySelector('[data-translations-list]');
      const row = makeRowFromTemplate(form);
      if (list && row) {
        list.appendChild(row);
        row.querySelector('[data-field="value"]')?.focus();
      }
    }
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saveBtn = form.querySelector('[data-action="save"]');
  const slug = form.dataset.slug;

  if (!slug) {
    setStatus(form, '✗ Brak slug — błąd komponentu', 'error');
    return;
  }

  const translations = collectTranslations(form);

  if (saveBtn) saveBtn.disabled = true;
  setStatus(form, 'Zapisuję…', '');

  try {
    const res = await fetch('/api/admin/save-translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, translations }),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      // not JSON
    }
    if (!res.ok) {
      const detail = body?.error || `HTTP ${res.status}`;
      throw new Error(detail.includes('404') ? 'Endpoint nie istnieje (produkcja?)' : detail);
    }
    setStatus(form, `✓ Zapisano ${body.count} tłumaczeń → ${body.path}`, 'success');
  } catch (err) {
    setStatus(form, `✗ Błąd: ${err.message}`, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function init() {
  document.querySelectorAll('[data-admin-dict-form]').forEach((form) => {
    if (form.dataset.adminDictBound === 'true') return;
    form.dataset.adminDictBound = 'true';
    form.addEventListener('submit', handleSubmit);
    bindRowControls(form);
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
