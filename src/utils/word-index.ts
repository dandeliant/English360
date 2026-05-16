// Build-time index of every dictionary lemma across all lessons.
//
// Output: Map<slug, DictEntry> with each entry containing:
// - lemma + slug
// - optional IPA + Polish translation (lifted from any lesson's vocab
//   where the term lemmatizes to the same key)
// - list of occurrences: { lessonId, lessonTitle, lessonDate, level, sentence }
//
// Cached at module scope so successive page renders in the same build
// reuse the same Map.

import { getCollection } from 'astro:content';
import { lemmaOf, slugOf, tokenize } from './text-tokenize.ts';
import { CEFR_LEVELS, type CefrLevel } from './cefr.ts';

export type Occurrence = {
  lessonId: string;
  lessonTitlePl: string;
  lessonDate: string;
  level: CefrLevel;
  sentence: string;
};

export type DictEntry = {
  lemma: string;
  slug: string;
  ipaBr?: string;
  translationPl?: string;
  occurrences: Occurrence[];
};

let _cache: Map<string, DictEntry> | null = null;

/** Split a paragraph into sentences. Good-enough heuristic for prose:
 *  break on .!? followed by whitespace + an opener (uppercase or quote). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"„'(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function buildWordIndex(): Promise<Map<string, DictEntry>> {
  if (_cache) return _cache;

  const lessons = await getCollection('lessons');
  const index = new Map<string, DictEntry>();

  function ensure(slug: string, lemma: string): DictEntry {
    let entry = index.get(slug);
    if (!entry) {
      entry = { lemma, slug, occurrences: [] };
      index.set(slug, entry);
    }
    return entry;
  }

  for (const lesson of lessons) {
    const { id, data } = lesson;

    // Pass 1: lift IPA + PL translation from vocab onto matching lemmas.
    // Skip multi-word terms (e.g. "honey bee") — they don't lemmatize cleanly.
    for (const level of CEFR_LEVELS) {
      const lv = data.levels[level];
      if (!lv?.vocab) continue;
      for (const v of lv.vocab) {
        if (/\s/.test(v.term)) continue;
        const lemma = lemmaOf(v.term);
        const slug = slugOf(lemma);
        if (!slug) continue;
        const entry = ensure(slug, lemma);
        if (!entry.ipaBr && v.ipa_br) entry.ipaBr = v.ipa_br;
        if (!entry.translationPl && v.pl) entry.translationPl = v.pl;
      }
    }

    // Pass 2: walk every sentence in every level, attach occurrences.
    // Each (lesson, level, sentence) contributes at most ONE occurrence
    // per unique lemma — avoids duplicates when a word repeats in a sentence.
    for (const level of CEFR_LEVELS) {
      const lv = data.levels[level];
      if (!lv?.text) continue;
      const sentences = splitSentences(lv.text);
      for (const sentence of sentences) {
        const seen = new Set<string>();
        for (const tok of tokenize(sentence)) {
          if (tok.type !== 'word' || !tok.slug) continue;
          if (seen.has(tok.slug)) continue;
          seen.add(tok.slug);
          const entry = ensure(tok.slug, tok.lemma);
          entry.occurrences.push({
            lessonId: id,
            lessonTitlePl: data.title_pl,
            lessonDate: data.date_assigned,
            level,
            sentence,
          });
        }
      }
    }
  }

  _cache = index;
  return index;
}
