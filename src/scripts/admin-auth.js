// Client-side login gate for /admin pages.
//
// IMPORTANT: this is NOT real security. Hash and username live in the
// shipped JS — anyone determined can read them. The actual barrier is
// that the save endpoint (/api/admin/save-lesson) only exists during
// `npm run dev`; in production it 404s, so even a "logged-in" attacker
// can't change anything. This gate just prevents casual visitors from
// stumbling into the admin form on the deployed site.

const STORAGE_KEY = 'english360.admin_session';
const SESSION_MS = 4 * 60 * 60 * 1000; // 4 hours

const EXPECTED_USERNAME = 'Daniel';
// SHA-256 of the password — never store plaintext, even in client code.
const EXPECTED_PASS_HASH =
  '70ee47ea6ab93b31b962fa27cdee8b240cf265dc50509a1e2ecf2480ac644090';

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || typeof session.until !== 'number' || session.until < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function writeSession(user) {
  const session = { user, until: Date.now() + SESSION_MS };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable — session is in-memory only.
  }
  return session;
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

async function tryLogin(username, password) {
  if (username !== EXPECTED_USERNAME) return false;
  const hash = await sha256Hex(password);
  return hash === EXPECTED_PASS_HASH;
}

function applyGate(isAuthed) {
  document.documentElement.dataset.adminAuthed = isAuthed ? 'true' : 'false';
  document.querySelectorAll('[data-admin-gated]').forEach((el) => {
    el.hidden = !isAuthed;
  });
  document.querySelectorAll('[data-admin-login-panel]').forEach((el) => {
    el.hidden = isAuthed;
  });
  document.querySelectorAll('[data-admin-session-user]').forEach((el) => {
    const session = readSession();
    el.textContent = session?.user || '';
  });
}

function bindLogin() {
  const form = document.querySelector('[data-admin-login-form]');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  const status = form.querySelector('[data-admin-login-status]');
  const passwordField = form.querySelector('input[name="password"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (status) {
      status.textContent = 'Sprawdzam…';
      delete status.dataset.tone;
    }

    const data = new FormData(form);
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');

    if (!username || !password) {
      if (status) {
        status.textContent = 'Wpisz login i hasło.';
        status.dataset.tone = 'error';
      }
      return;
    }

    const ok = await tryLogin(username, password);
    if (ok) {
      writeSession(username);
      applyGate(true);
      if (status) {
        status.textContent = `✓ Zalogowano jako ${username}.`;
        status.dataset.tone = 'success';
      }
      if (passwordField) passwordField.value = '';
    } else {
      if (status) {
        status.textContent = '✗ Niepoprawny login lub hasło.';
        status.dataset.tone = 'error';
      }
      if (passwordField) {
        passwordField.value = '';
        passwordField.focus();
      }
    }
  });
}

function bindLogout() {
  document.querySelectorAll('[data-admin-logout]').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
      clearSession();
      applyGate(false);
      // Scroll back to login form
      const panel = document.querySelector('[data-admin-login-panel]');
      if (panel && typeof panel.scrollIntoView === 'function') {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function init() {
  applyGate(!!readSession());
  bindLogin();
  bindLogout();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
