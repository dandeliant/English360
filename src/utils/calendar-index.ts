// Build-time MM-DD → lesson map for the calendar view.
//
// The project's premise is 365 unique lessons keyed to calendar days,
// not specific years — a lesson dated 2025-05-10 appears on May 10
// regardless of which year is currently displayed. `date_assigned`
// always wins over `date_alternatives` when both could claim the same
// day; among conflicts at the same priority, the more recent lesson wins.

import { getCollection, type CollectionEntry } from 'astro:content';

export type CalendarMap = Map<string, CollectionEntry<'lessons'>>;

let _cache: CalendarMap | null = null;

export async function buildCalendarIndex(): Promise<CalendarMap> {
  if (_cache) return _cache;

  const lessons = await getCollection('lessons');
  // Newest first so a tie on MM-DD prefers the most recent entry.
  const sorted = [...lessons].sort((a, b) =>
    b.data.date_assigned.localeCompare(a.data.date_assigned),
  );

  const index: CalendarMap = new Map();

  // Pass 1 — primary date_assigned takes precedence on its MM-DD.
  for (const lesson of sorted) {
    const md = lesson.data.date_assigned.slice(5); // 'MM-DD'
    if (!index.has(md)) index.set(md, lesson);
  }

  // Pass 2 — date_alternatives fill remaining gaps only.
  for (const lesson of sorted) {
    for (const alt of lesson.data.date_alternatives) {
      const md = alt.slice(5);
      if (!index.has(md)) index.set(md, lesson);
    }
  }

  _cache = index;
  return index;
}

/** Convenience: returns the lesson for a given Date (or null). */
export async function lessonForDate(
  date: Date,
): Promise<CollectionEntry<'lessons'> | null> {
  const index = await buildCalendarIndex();
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return index.get(md) ?? null;
}
