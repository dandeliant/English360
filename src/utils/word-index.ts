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
  /** Same-index sentence from the level's `text_pl`, if both sides split
   *  into the same number of sentences. Missing when EN and PL sentence
   *  counts diverge — e.g. a translation that merges two English
   *  sentences into one Polish one. */
  sentencePl?: string;
};

export type DictEntry = {
  lemma: string;
  slug: string;
  /** Most common capitalisation seen in lesson text. Equal to `lemma` for
   *  common words; differs for proper nouns ("Polish", "Poland", "May"...).
   *  Used in page headers, Wiktionary back-links, and as the Wiktionary
   *  fetch term so we hit the right disambiguation page. */
  displayForm: string;
  ipaBr?: string;
  /** All Polish translations, deduplicated. First entry is the primary one
   *  (used in headers); the tooltip shows all of them, joined by commas. */
  translationsPl: string[];
  occurrences: Occurrence[];
};

/** Heuristic: a lemma is treated as a proper noun if at least half of its
 *  surface-form occurrences start with an uppercase letter. Works for
 *  Polish, Poland, France, May (month), Brassicaceae, etc.; tolerates
 *  start-of-sentence capitalisation of common words because those are
 *  outnumbered by mid-sentence lowercase usage. */
function pickDisplayForm(forms: Map<string, number>, lemma: string): string {
  let capped = 0;
  let lower = 0;
  let bestCap = '';
  let bestCapN = 0;
  for (const [surface, count] of forms) {
    if (/^[A-Z]/.test(surface)) {
      capped += count;
      if (count > bestCapN) {
        bestCapN = count;
        bestCap = surface;
      }
    } else {
      lower += count;
    }
  }
  // Tie-break toward proper noun: if a word is EVER capitalised mid-sentence
  // (`capped > 0`) and capitalised forms aren't strictly outnumbered by
  // lowercase ones, treat it as a proper noun. This catches cases like
  // "Polish" (1 cap as adjective) clashing with "polished" (1 lower as verb
  // past participle) — both lemmatise to "polish"; we prefer the Wiktionary
  // proper-noun page since it carries more information. Author can override
  // via vocab.term if they want the lowercase sense.
  return capped > 0 && capped >= lower && bestCap ? bestCap : lemma;
}

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
 *  break on .!? followed by whitespace + an opener (any Unicode
 *  uppercase letter or a quote). `\p{Lu}` covers Polish uppercase
 *  Ą Ę Ó Ś Ł Ć Ń Ż Ź in addition to Latin A-Z, so the same splitter
 *  works for text_pl. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[\p{Lu}"„'(])/u)
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
      entry = { lemma, slug, displayForm: lemma, translationsPl: [], occurrences: [] };
      index.set(slug, entry);
    }
    return entry;
  }

  // Track surface-form usage per slug to pick a sensible display capitalisation.
  const formCounts = new Map<string, Map<string, number>>();
  function recordForm(slug: string, form: string) {
    let m = formCounts.get(slug);
    if (!m) {
      m = new Map();
      formCounts.set(slug, m);
    }
    m.set(form, (m.get(form) || 0) + 1);
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
      // Split the Polish translation as well; sentencePl is aligned by
      // index and only used when EN and PL split into the same count.
      const sentencesPl = lv.text_pl ? splitSentences(lv.text_pl) : [];
      const alignPl = sentencesPl.length === sentences.length;
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const sentencePl = alignPl ? sentencesPl[i] : undefined;
        const seen = new Set<string>();
        // Skip the first word of every sentence when judging proper-noun
        // capitalisation — sentence-start always capitalises so it carries
        // no signal. Polish / Poland / May still register elsewhere; After,
        // Behind, Everything, There etc. fall back to lowercase as expected.
        let isFirstWord = true;
        for (const tok of tokenize(sentence)) {
          if (tok.type !== 'word' || !tok.slug) continue;
          if (!isFirstWord) recordForm(tok.slug, tok.text);
          isFirstWord = false;
          if (seen.has(tok.slug)) continue;
          seen.add(tok.slug);
          const entry = ensure(tok.slug, tok.lemma);
          entry.occurrences.push({
            lessonId: id,
            lessonTitlePl: data.title_pl,
            lessonDate: data.date_assigned,
            level,
            sentence,
            sentencePl,
          });
        }
      }
    }
  }

  // Pass 2.5 — fix displayForm for proper nouns.
  for (const [slug, forms] of formCounts) {
    const entry = index.get(slug);
    if (!entry) continue;
    entry.displayForm = pickDisplayForm(forms, entry.lemma);
  }

  // Pass 3 — pull Polish translations cached from EN Wiktionary's
  // `Translations` section. User-authored vocab translations (from pass 1)
  // come first; Wiktionary appends additional senses that the author may
  // not have spelled out. Deduplication preserves order.
  //
  // Also lift a hand-authored `ipaBr` from the cache as a fallback: function
  // words like "the" never appear in a lesson's vocab, so no `ipa_br` reaches
  // pass 1 — the cache file is their only source of pronunciation.
  await Promise.all(
    [...index.values()].map(async (entry) => {
      const wikt = await loadWiktionary(entry.slug);
      if (!entry.ipaBr && wikt?.ipaBr) entry.ipaBr = wikt.ipaBr;
      if (wikt?.translations && wikt.translations.length > 0) {
        mergeTranslations(entry, wikt.translations);
      }
    }),
  );

  _cache = index;
  return index;
}
