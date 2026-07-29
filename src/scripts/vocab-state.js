// Personal vocab journal + spaced repetition (FSRS).
//
// Everything lives in localStorage under `english360.vocab` so it is
// purely client-side — no account, no sync across devices. The state
// keys words by their dictionary slug (lowercase, alphanumeric), which
// matches the URL slug on /slownik/<word>. (The storage key keeps the
// historical `english360.` namespace so existing users don't lose data
// across the English 365 rebrand.)
//
// Scheduling uses FSRS — the memory-model scheduler modern Anki uses. See
// ./fsrs.js. Review grades are the four Anki buttons:
//   1 = "Jeszcze raz" (Again)  — forgot; also re-queued within the session
//   2 = "Trudne"      (Hard)
//   3 = "Dobrze"      (Good)
//   4 = "Łatwe"       (Easy)
//
// Schema:
//   {
//     starred: { <slug>: { addedAt: ISO, lessonId?: string } },
//     srs: {
//       <slug>: {
//         stability: number,     // FSRS S (days)
//         difficulty: number,    // FSRS D (1..10)
//         reps: number,          // total reviews
//         lapses: number,        // times answered "Again"
//         interval: number,      // last scheduled interval (days)
//         due: "YYYY-MM-DD",      // when next review is due
//         last_review: ISO|null, // when last reviewed
//         state: "new"|"review"
//       }
//     }
//   }
//
// Legacy SM-2 entries (ease/interval/reps) are migrated lazily: the first
// FSRS review of such a word starts it fresh from that grade.

import { schedule, AGAIN, EASY } from './fsrs.js';

const KEY = 'english360.vocab';
const CHANGE_EVENT = 'english365-vocab-changed';

/** Stability (days) at or above which a word counts as "mastered". */
const MASTERED_STABILITY = 21;
const DAY_MS = 86400000;

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
  // Initialise a fresh FSRS card — due immediately so the word enters the
  // next session. stability 0 marks it as not-yet-scheduled.
  if (!s.srs[slug]) {
    s.srs[slug] = {
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      interval: 0,
      due: todayIso(),
      last_review: null,
      state: 'new',
    };
  }
  writeState(s);
}

export function unstar(slug) {
  if (!slug) return;
  const s = readState();
  if (!s.starred[slug] && !s.srs[slug]) return;
  delete s.starred[slug];
  // Drop srs state too — if the user unstars, they meant it.
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

// ── SRS (FSRS) ─────────────────────────────────────────────────────────────

function elapsedDaysSince(lastReviewIso) {
  if (!lastReviewIso) return 0;
  const then = new Date(lastReviewIso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / DAY_MS));
}

/**
 * Record a review and reschedule the word with FSRS.
 * @param slug  dictionary slug.
 * @param grade 1 Again | 2 Hard | 3 Good | 4 Easy.
 * @returns the new srs entry, or null on bad input.
 */
export function review(slug, grade) {
  if (!slug) return null;
  if (![AGAIN, 2, 3, EASY].includes(grade)) return null;
  const s = readState();
  const prev = s.srs[slug];
  // A legacy SM-2 entry (has `ease`, no `stability`) is treated as a first
  // FSRS review — schedule() re-initialises it from this grade.
  const fsrsPrev = prev && typeof prev.stability === 'number' && prev.stability > 0 ? prev : null;
  const res = schedule(fsrsPrev, grade, elapsedDaysSince(prev && prev.last_review));

  const due = new Date();
  due.setDate(due.getDate() + res.interval);

  const entry = {
    stability: res.stability,
    difficulty: res.difficulty,
    reps: res.reps,
    lapses: res.lapses,
    interval: res.interval,
    due: isoDate(due),
    last_review: new Date().toISOString(),
    state: 'review',
  };
  s.srs[slug] = entry;
  writeState(s);
  return entry;
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
    const reviewed = e && (e.reps ?? 0) > 0;
    if (reviewed && (e.stability ?? 0) >= MASTERED_STABILITY) mastered += 1;
    else if (reviewed) learning += 1;
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
