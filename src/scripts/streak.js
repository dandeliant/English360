// Daily streak + lesson-progress tracking — pure client-side, localStorage only.
//
// Schema in localStorage `english360.streak`:
//   {
//     lastVisit: "YYYY-MM-DD",       // last day the user opened any page
//     days: 5,                        // current consecutive-day streak
//     longest: 12,                    // best ever (for future progress page)
//     lessonsRead: ["2025-05-10-tree-yellow", ...]
//   }
//
// Rules:
//   - first visit ever         → start day-1 streak
//   - same day                 → no change
//   - yesterday → today        → days + 1, longest = max(longest, days)
//   - gap (≥ 2 days)           → reset to day 1, longest preserved
//
// The badge stays hidden until days ≥ 2 so a first-time visitor isn't
// greeted with "🔥 1" on landing — that reads as silly.

const KEY = 'english360.streak';

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIso() { return isoDate(new Date()); }
function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return {
      lastVisit: obj.lastVisit || null,
      days: Number(obj.days) || 0,
      longest: Number(obj.longest) || 0,
      lessonsRead: Array.isArray(obj.lessonsRead) ? obj.lessonsRead : [],
    };
  } catch {
    return null;
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best-effort only.
  }
}

function updateStreak() {
  const today = todayIso();
  const yesterday = yesterdayIso();
  let s = read();
  if (!s) {
    s = { lastVisit: today, days: 1, longest: 1, lessonsRead: [] };
  } else if (s.lastVisit === today) {
    // Same day — no streak change.
  } else if (s.lastVisit === yesterday) {
    s.days += 1;
    if (s.days > s.longest) s.longest = s.days;
    s.lastVisit = today;
  } else {
    // Gap.
    s.days = 1;
    s.lastVisit = today;
  }
  write(s);
  return s;
}

function markCurrentLessonRead() {
  const match = window.location.pathname.match(/\/lekcja\/([^/]+)\/?$/);
  if (!match) return;
  const id = match[1];
  const s = read() || { lastVisit: todayIso(), days: 1, longest: 1, lessonsRead: [] };
  if (!s.lessonsRead.includes(id)) {
    s.lessonsRead.push(id);
    write(s);
  }
}

function renderBadges() {
  const s = read();
  const days = s?.days || 0;
  document.querySelectorAll('[data-streak-badge]').forEach((el) => {
    if (days >= 2) {
      el.hidden = false;
      const count = el.querySelector('[data-streak-count]');
      if (count) count.textContent = String(days);
      const tooltip = el.getAttribute('title') || '';
      el.setAttribute(
        'title',
        s?.longest && s.longest > days
          ? `${days} dni z rzędu · rekord: ${s.longest}`
          : `${days} dni z rzędu`,
      );
    } else {
      el.hidden = true;
    }
  });
}

function init() {
  updateStreak();
  markCurrentLessonRead();
  renderBadges();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// Public helpers in case future pages want the data
// (e.g. /postep — progress overview page in phase 2).
export function getStreakState() {
  return read();
}
