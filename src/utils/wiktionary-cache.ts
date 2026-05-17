// Reads the build-time Wiktionary cache populated by
// scripts/sync-dictionary.mjs. Pages call loadWiktionary(slug) inside
// their frontmatter; if the cache file is missing, returns null and
// the page renders without the Wiktionary section.

import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '../data/wiktionary');

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
