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
  fetchedAt: string;
  en: WiktionaryEnEntry[] | null;
  pl: WiktionaryPlSummary | null;
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
