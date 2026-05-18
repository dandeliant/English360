// Personal vocab journal + Spaced Repetition (SM-2) state.
//
// Everything lives in localStorage under `english360.vocab` so it is
// purely client-side — no account, no sync across devices. The state
// keys words by their dictionary slug (lowercase, alphanumeric), which
// matches the URL slug on /slownik/<word>.
//
// Schema:
//   {
//     starred: {
//       <slug>: { addedAt: ISO, lessonId?: string }
//     },
//     srs: {
//       <slug>: {
//         ease: 2.5,        // SM-2 ease factor (>=1.3)
//         interval: 1,       // days until next review
//         reps: 3,           // successful repetitions in a row
//         due: "YYYY-MM-DD", // when next review is due
//         lastReview: ISO    // when last reviewed
//       }
//     }
//   }
//
// Review quality scale (passed to reviewSrs):
//   0 = "Nie wiem"  → reset, treat as new
//   3 = "Trudne"    → barely passed
//   4 = "Dobre"     → solid recall
//   5 = "Łatwe"     → instant recall, larger interval boost

const KEY = 'english360.vocab';
const CHANGE_EVENT = 'english360-vocab-changed';

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIso() { return isoDate(new Date()); }

function emptyState() {
  return { starred: {}, srs: {} };
}

export function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return emptyState();
    return {
      starred: obj.starred && typeof obj.starred === 'object' ? obj.starred : {},
      srs: obj.srs && typeof obj.srs === 'object' ? obj.srs : {},
    };
  } catch {
    return emptyState();
  }
}

function writeState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Best-effort only — private mode, quota, etc.
  }
}

// ── Star / unstar ──────────────────────────────────────────────────────────

export function isStarred(slug) {
  if (!slug) return false;
  const s = readState();
  return Boolean(s.starred[slug]);
}

export function star(slug, opts = {}) {
  if (!slug) return;
  const s = readState();
  if (s.starred[slug]) return; // already starred
  s.starred[slug] = {
    addedAt: new Date().toISOString(),
    ...(opts.lessonId ? { lessonId: opts.lessonId } : {}),
  };
  // Initialise SRS state — due immediately so the word enters the next session.
  if (!s.srs[slug]) {
    s.srs[slug] = {
      ease: DEFAULT_EASE,
      interval: 0,
      reps: 0,
      due: todayIso(),
      lastReview: null,
    };
  }
  writeState(s);
}

export function unstar(slug) {
  if (!slug) return;
  const s = readState();
  if (!s.starred[slug] && !s.srs[slug]) return;
  delete s.starred[slug];
  // Keep srs state? Better drop it — if the user unstars they meant it.
  delete s.srs[slug];
  writeState(s);
}

export function toggleStar(slug, opts = {}) {
  if (isStarred(slug)) {
    unstar(slug);
    return false;
  }
  star(slug, opts);
  return true;
}

// ── SRS (SM-2) ─────────────────────────────────────────────────────────────

/** SM-2 update. Returns the new entry; caller writes it. */
function nextSrsEntry(prev, quality) {
  const ease = clampEase(
    (prev?.ease ?? DEFAULT_EASE) + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );
  let reps = prev?.reps ?? 0;
  let interval;

  if (quality < 3) {
    // Failure — back to step 1.
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.max(1, Math.round((prev?.interval ?? 1) * ease));
  }

  const due = new Date();
  due.setDate(due.getDate() + interval);

  return {
    ease,
    interval,
    reps,
    due: isoDate(due),
    lastReview: new Date().toISOString(),
  };
}

function clampEase(value) {
  if (Number.isNaN(value)) return MIN_EASE;
  return Math.max(MIN_EASE, Math.min(3.5, value));
}

export function review(slug, quality) {
  if (!slug) return null;
  if (![0, 3, 4, 5].includes(quality)) return null;
  const s = readState();
  const next = nextSrsEntry(s.srs[slug], quality);
  s.srs[slug] = next;
  writeState(s);
  return next;
}

// ── Queries ────────────────────────────────────────────────────────────────

export function getDueSlugs(date = todayIso()) {
  const s = readState();
  const out = [];
  for (const slug of Object.keys(s.starred)) {
    const e = s.srs[slug];
    if (!e || (e.due && e.due <= date)) out.push(slug);
  }
  return out;
}

export function getAllStarredSlugs() {
  return Object.keys(readState().starred);
}

export function getCounts(date = todayIso()) {
  const s = readState();
  let starred = 0;
  let due = 0;
  let learning = 0;
  let mastered = 0;
  for (const slug of Object.keys(s.starred)) {
    starred += 1;
    const e = s.srs[slug];
    if (!e || (e.due && e.due <= date)) due += 1;
    if (e && (e.reps ?? 0) >= 5) mastered += 1;
    else if (e && (e.reps ?? 0) > 0) learning += 1;
  }
  return { starred, due, learning, mastered };
}

export function getSrsEntry(slug) {
  return readState().srs[slug] || null;
}

// ── Reactivity helpers ─────────────────────────────────────────────────────

/** Subscribe to changes. Returns an unsubscribe function. */
export function onChange(handler) {
  const local = () => handler();
  const cross = (event) => {
    if (event.key === KEY) handler();
  };
  window.addEventListener(CHANGE_EVENT, local);
  window.addEventListener('storage', cross);
  return () => {
    window.removeEventListener(CHANGE_EVENT, local);
    window.removeEventListener('storage', cross);
  };
}
