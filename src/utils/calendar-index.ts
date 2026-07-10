// Build-time MM-DD → lesson[] map for the calendar view.
//
// The project's premise is that lessons are keyed to calendar days,
// not specific years — a lesson dated 2025-05-10 appears on May 10
// regardless of which year is currently displayed. Multiple lessons
// can legitimately share an MM-DD (e.g. one photo taken in 2025 and
// another in 2026 both landing on July 8), so the map stores an array
// of lessons per day, ordered newest-first (by `date_assigned` DESC).
//
// `date_assigned` is the primary channel; `date_alternatives` still
// contribute, and a lesson can appear on more than one day if it lists
// alternatives. Each MM-DD deduplicates by lesson id so a lesson never
// appears twice in the same bucket.
//
// The first element of each bucket is what the calendar cell shows as
// its foggy background and where the day-cell click leads. Subsequent
// elements surface in the hover preview.

import { getCollection, type CollectionEntry } from 'astro:content';

export type CalendarMap = Map<string, CollectionEntry<'lessons'>[]>;

let _cache: CalendarMap | null = null;

export async function buildCalendarIndex(): Promise<CalendarMap> {
  if (_cache) return _cache;

  const lessons = await getCollection('lessons');
  // Newest first so bucket arrays end up newest-first as well.
  const sorted = [...lessons].sort((a, b) =>
    b.data.date_assigned.localeCompare(a.data.date_assigned),
  );

  const index: CalendarMap = new Map();
  const seenIds: Map<string, Set<string>> = new Map();

  function addAt(md: string, lesson: CollectionEntry<'lessons'>) {
    let bucket = index.get(md);
    let ids = seenIds.get(md);
    if (!bucket) {
      bucket = [];
      ids = new Set();
      index.set(md, bucket);
      seenIds.set(md, ids);
    }
    if (!ids!.has(lesson.id)) {
      ids!.add(lesson.id);
      bucket.push(lesson);
    }
  }

  // Pass 1 — date_assigned. Newer entries land first in each bucket.
  for (const lesson of sorted) {
    addAt(lesson.data.date_assigned.slice(5), lesson);
  }

  // Pass 2 — date_alternatives. Dedup by id ensures a lesson listed in
  // both channels for the same day is counted once.
  for (const lesson of sorted) {
    for (const alt of lesson.data.date_alternatives) {
      addAt(alt.slice(5), lesson);
    }
  }

  _cache = index;
  return index;
}

/** All lessons registered for a given calendar date, newest first.
 *  Returns [] if the date has no matching lesson. */
export async function lessonsForDate(
  date: Date,
): Promise<CollectionEntry<'lessons'>[]> {
  const index = await buildCalendarIndex();
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return index.get(md) ?? [];
}
