// CEFR level constants & labels — used by tabs, panels, exercises.
// Kept separate from content/config.ts because Astro's content config
// is meant to export `collections` only.

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export const CEFR_DESCRIPTIONS: Record<CefrLevel, string> = {
  A1: 'Początkujący',
  A2: 'Podstawowy',
  B1: 'Średniozaawansowany',
  B2: 'Wyżej średniozaawansowany',
  C1: 'Zaawansowany',
  C2: 'Biegły',
};

export const DEFAULT_LEVEL: CefrLevel = 'B1';
