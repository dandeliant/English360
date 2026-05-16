// Tokenizer for lesson texts.
//
// Splits an English paragraph into a sequence of tokens that the lesson
// renderer can map to clickable `<a>` elements (words) or plain text
// (whitespace, punctuation). Each word token carries its lemma and a
// URL slug so we can link to /slownik/<slug>/.
//
// Uses wink-lemmatizer (noun → verb → adjective cascade) because we don't
// run a POS tagger. Trailing possessive/contractive suffixes are stripped
// before lemmatization, so "bee's" → lemma "bee", "don't" → lemma "do".

import lemmatizer from 'wink-lemmatizer';

export type WordToken = {
  type: 'word';
  text: string;   // surface form as it appears in the lesson
  lemma: string;  // dictionary form
  slug: string;   // URL-safe slug (alphanumeric only)
};

export type Token =
  | WordToken
  | { type: 'space'; text: string }
  | { type: 'punct'; text: string };

const TOKEN_RE = /([A-Za-z]+(?:'[A-Za-z]+)?)|(\s+)|([^A-Za-z\s]+)/g;

/** Best-effort lemmatization without POS tagging. */
export function lemmaOf(word: string): string {
  const lower = word.toLowerCase();
  const base = lower.replace(/'[a-z]+$/, '');
  const n = lemmatizer.noun(base);
  if (n !== base) return n;
  const v = lemmatizer.verb(base);
  if (v !== base) return v;
  const a = lemmatizer.adjective(base);
  if (a !== base) return a;
  return base;
}

/** URL-safe slug — alphanumeric only, lowercased. */
export function slugOf(lemma: string): string {
  return lemma.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    if (m[1]) {
      const word = m[1];
      const lemma = lemmaOf(word);
      const slug = slugOf(lemma);
      tokens.push({ type: 'word', text: word, lemma, slug });
    } else if (m[2]) {
      tokens.push({ type: 'space', text: m[2] });
    } else if (m[3]) {
      tokens.push({ type: 'punct', text: m[3] });
    }
  }
  return tokens;
}

/** Convenience: just the unique lemmas in a piece of text, sorted. */
export function uniqueLemmas(text: string): string[] {
  const seen = new Set<string>();
  for (const t of tokenize(text)) {
    if (t.type === 'word' && t.slug) seen.add(t.lemma);
  }
  return [...seen].sort();
}
