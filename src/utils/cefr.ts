// CEFR level constants & labels — used by tabs, panels, exercises.
// Kept separate from content/config.ts because Astro's content config
// is meant to export `collections` only.

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

// Polish-only labels.
export const CEFR_DESCRIPTIONS: Record<CefrLevel, string> = {
  A1: 'Początkujący',
  A2: 'Podstawowy',
  B1: 'Średnio zaawansowany',
  B2: 'Wyższy średnio zaawansowany',
  C1: 'Zaawansowany',
  C2: 'Biegły',
};

// English (CEFR-standard) names — shown next to the Polish label where space allows.
export const CEFR_NAMES_EN: Record<CefrLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-Intermediate',
  C1: 'Advanced',
  C2: 'Proficiency',
};

// Bilingual single-string version — used in aria-labels and tooltips
// where wrapping is fine and we want both for screen readers.
export const CEFR_LABELS_FULL: Record<CefrLevel, string> = (
  Object.fromEntries(
    CEFR_LEVELS.map((l) => [l, `${CEFR_DESCRIPTIONS[l]} (${CEFR_NAMES_EN[l]})`]),
  ) as Record<CefrLevel, string>
);

export const DEFAULT_LEVEL: CefrLevel = 'B1';
