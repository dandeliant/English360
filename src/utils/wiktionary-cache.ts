// Reads the build-time Wiktionary cache populated by
// scripts/sync-dictionary.mjs. Pages call loadWiktionary(slug) inside
// their frontmatter; if the cache file is missing, returns null and
// the page renders without the Wiktionary section.

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

// Resolve from the project root (Astro invokes both `dev` and `build`
// from there). Using __dirname/import.meta.url gets bundled into the
// dist/ chunk path at build time and points at dist/data/wiktionary,
// which does not exist — that broke Wiktionary loading during SSG for
// the entire history of the project until this fix.
const CACHE_DIR = join(process.cwd(), 'src', 'data', 'wiktionary');

export type WiktionaryEnEntry = {
  partOfSpeech: string;
  definitions: Array<{
    text: string;
    examples?: string[];
  }>;
};

export type WiktionaryPlSummary = {
  title: string;
  extract: string;
  url: string;
};

export type WiktionaryCache = {
  lemma: string;
  slug: string;
  /** Surface form used to fetch this entry from Wiktionary. For most
   *  words equals `lemma`; for proper nouns it's the capitalised form
   *  (e.g. `Polish` rather than `polish`) so we hit the right page. */
  fetchTerm?: string;
  fetchedAt: string;
  /** British IPA pronunciation, e.g. `/ðə, ðiː/`. Optional, hand-authored
   *  in the cache file for words that never appear in a lesson's vocab (so
   *  no `ipa_br` flows in from there). Lifted onto `DictEntry.ipaBr` by the
   *  word index when no lesson vocab already supplied one. */
  ipaBr?: string;
  en: WiktionaryEnEntry[] | null;
  pl: WiktionaryPlSummary | null;
  /** Polish translations harvested from the EN Wiktionary page's
   *  `Translations` tables. `null` = fetch failed, retry next sync.
   *  `[]` = fetched, no Polish translation on the page. */
  translations?: string[] | null;
};

export async function loadWiktionary(slug: string): Promise<WiktionaryCache | null> {
  const path = join(CACHE_DIR, `${slug}.json`);
  try {
    await access(path);
  } catch {
    return null;
  }
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as WiktionaryCache;
  } catch {
    return null;
  }
}
