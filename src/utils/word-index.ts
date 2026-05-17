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
import { loadWiktionary } from './wiktionary-cache.ts';

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
  /** All Polish translations, deduplicated. First entry is the primary one
   *  (used in headers); slice(0, 3).join(', ') is what hover tooltips show. */
  translationsPl: string[];
  occurrences: Occurrence[];
};

/** Split a vocab.pl string into individual senses. The author may write
 *  `"skraj, krawędź"` or `"klasztorny; ascetyczny"` — both become two
 *  translations. Parenthetical hints stay attached to the sense that
 *  contains them (no splitting inside parens). */
function splitVocabPl(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of raw) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

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
      entry = { lemma, slug, translationsPl: [], occurrences: [] };
      index.set(slug, entry);
    }
    return entry;
  }

  function mergeTranslations(entry: DictEntry, more: readonly string[]) {
    for (const t of more) {
      if (!t) continue;
      if (!entry.translationsPl.includes(t)) entry.translationsPl.push(t);
    }
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
        if (v.pl) mergeTranslations(entry, splitVocabPl(v.pl));
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

  // Pass 3 — pull Polish translations cached from EN Wiktionary's
  // `Translations` section. User-authored vocab translations (from pass 1)
  // come first; Wiktionary appends additional senses that the author may
  // not have spelled out. Deduplication preserves order.
  await Promise.all(
    [...index.values()].map(async (entry) => {
      const wikt = await loadWiktionary(entry.slug);
      if (wikt?.translations && wikt.translations.length > 0) {
        mergeTranslations(entry, wikt.translations);
      }
    }),
  );

  _cache = index;
  return index;
}
