#!/usr/bin/env node
// Sync script: fetches Wiktionary entries (EN definitions + PL summary +
// EN-page Polish translations) for every lemma appearing in
// src/content/lessons/*.json and caches them in
// src/data/wiktionary/<slug>.json.
//
// Idempotent and incremental: per-lemma, only fields missing from the cache
// are fetched. Re-run safely after adding new lessons or to back-fill new
// fields (e.g. translations after this script was extended).
//
// Usage:
//   npm run sync-dictionary

import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import lemmatizer from 'wink-lemmatizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LESSONS_DIR = join(ROOT, 'src/content/lessons');
const CACHE_DIR = join(ROOT, 'src/data/wiktionary');

const UA = 'English360-LearningSite/0.1 (https://github.com/dandeliant/english-360; mailto:ostrowskidnl@gmail.com)';

const RATE_LIMIT_MS = 250;
const MAX_DEFINITIONS = 3;
const MAX_EXAMPLES = 2;
const MAX_TRANSLATIONS = 5;

// ── Tokenization (mirrors src/utils/text-tokenize.ts) ──────────────────────

const TOKEN_RE = /([A-Za-z]+(?:'[A-Za-z]+)?)|(\s+)|([^A-Za-z\s]+)/g;

function lemmaOf(word) {
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

function slugOf(lemma) {
  return lemma.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function uniqueLemmasInText(text) {
  const out = new Set();
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text))) {
    if (!m[1]) continue;
    const lemma = lemmaOf(m[1]);
    if (slugOf(lemma)) out.add(lemma);
  }
  return out;
}

/** Same split logic as src/utils/word-index.ts so proper-noun detection
 *  uses identical sentence boundaries. */
function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"„'(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Returns sorted [{ lemma, fetchTerm }] where fetchTerm is the surface
 *  form to send to Wiktionary. For most words fetchTerm === lemma; for
 *  proper nouns (Polish, Poland, France, May, Brassicaceae...) fetchTerm
 *  is the capitalised form so we hit the correct disambiguation page. */
async function collectLemmas() {
  // slug -> { lemma, forms: Map<surface, count> }
  const stats = new Map();

  function record(lemma, surface) {
    const slug = slugOf(lemma);
    if (!slug) return;
    let s = stats.get(slug);
    if (!s) {
      s = { lemma, forms: new Map() };
      stats.set(slug, s);
    }
    s.forms.set(surface, (s.forms.get(surface) || 0) + 1);
  }

  const files = await readdir(LESSONS_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(LESSONS_DIR, file), 'utf8');
    const data = JSON.parse(raw);
    if (!data.levels) continue;
    for (const level of Object.values(data.levels)) {
      if (!level) continue;
      if (typeof level.text === 'string') {
        // Walk sentence by sentence so we can skip the first word of each
        // (it would always be capitalised regardless of part of speech).
        for (const sentence of splitSentences(level.text)) {
          TOKEN_RE.lastIndex = 0;
          let m;
          let isFirstWord = true;
          while ((m = TOKEN_RE.exec(sentence))) {
            if (!m[1]) continue;
            const surface = m[1];
            if (!isFirstWord) record(lemmaOf(surface), surface);
            else {
              // Still ensure the lemma is in stats (so we don't miss
              // proper nouns that appear only at sentence start) — but
              // without recording a misleading capitalised form.
              const lemma = lemmaOf(surface);
              const slug = slugOf(lemma);
              if (slug && !stats.has(slug)) stats.set(slug, { lemma, forms: new Map() });
            }
            isFirstWord = false;
          }
        }
      }
      if (Array.isArray(level.vocab)) {
        // Vocab terms only ensure the lemma is in the index — don't let
        // them sway proper-noun detection one way or the other (the
        // author's chosen case here is usually meaningless).
        for (const v of level.vocab) {
          if (typeof v.term !== 'string') continue;
          if (/\s/.test(v.term)) continue;
          const lemma = lemmaOf(v.term);
          const slug = slugOf(lemma);
          if (slug && !stats.has(slug)) stats.set(slug, { lemma, forms: new Map() });
        }
      }
    }
  }

  const out = [];
  for (const { lemma, forms } of stats.values()) {
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
    const fetchTerm = capped > lower && bestCap ? bestCap : lemma;
    out.push({ lemma, fetchTerm });
  }
  out.sort((a, b) => a.lemma.localeCompare(b.lemma));
  return out;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (res.status === 404) return { notFound: true };
  if (res.status === 429) {
    const wait = parseInt(res.headers.get('retry-after') || '5', 10) * 1000;
    return { rateLimited: true, wait };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return { data: await res.json() };
}

async function fetchJsonWithRetry(url) {
  let r = await fetchJson(url);
  if (r.rateLimited) {
    await sleep(r.wait);
    r = await fetchJson(url);
  }
  return r;
}

// ── Source parsers ─────────────────────────────────────────────────────────

function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEnDefinition(json) {
  if (!json || !Array.isArray(json.en)) return null;
  const out = [];
  for (const entry of json.en) {
    const defs = (entry.definitions || [])
      .slice(0, MAX_DEFINITIONS)
      .map((d) => ({
        text: stripHtml(d.definition || ''),
        examples: (d.parsedExamples || d.examples || [])
          .slice(0, MAX_EXAMPLES)
          .map((e) => (typeof e === 'string' ? stripHtml(e) : stripHtml(e?.example || '')))
          .filter(Boolean),
      }))
      .filter((d) => d.text);
    if (defs.length === 0) continue;
    out.push({ partOfSpeech: entry.partOfSpeech || '', definitions: defs });
  }
  return out.length ? out : null;
}

function parsePlSummary(json) {
  if (!json || typeof json.extract !== 'string' || !json.extract.trim()) return null;
  return {
    title: json.title,
    extract: json.extract.trim(),
    url:
      json.content_urls?.desktop?.page ||
      `https://pl.wiktionary.org/wiki/${encodeURIComponent(json.title)}`,
  };
}

/** Extract Polish translations from an EN Wiktionary page's wikitext.
 *  Looks for {{t|pl|...}}, {{t+|pl|...}}, {{t-|pl|...}}, {{tt|pl|...}}
 *  variants and similar; dedupes preserving order. Returns string[]. */
function parsePolishTranslations(wikitext) {
  if (typeof wikitext !== 'string') return [];
  const re = /\{\{t{1,2}[+\-±]?(?:-check)?\|pl\|([^|}]+)/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(wikitext))) {
    let word = m[1].trim();
    // Resolve wiki-links: [[link|display]] -> display, [[link]] -> link.
    word = word
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .trim();
    // Discard obvious noise (HTML, templates left over).
    if (!word || /[<>{}]/.test(word)) continue;
    if (!seen.has(word)) {
      seen.add(word);
      out.push(word);
    }
    if (out.length >= MAX_TRANSLATIONS) break;
  }
  return out;
}

// ── Per-field fetchers ─────────────────────────────────────────────────────

async function fetchEnDefinitions(fetchTerm) {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(fetchTerm)}`;
  try {
    const r = await fetchJsonWithRetry(url);
    if (r.notFound || !r.data) return null;
    return parseEnDefinition(r.data);
  } catch (err) {
    console.error(`\n  EN definition error for "${lemma}": ${err.message}`);
    return null;
  }
}

async function fetchPlSummary(fetchTerm) {
  const url = `https://pl.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(fetchTerm)}`;
  try {
    const r = await fetchJsonWithRetry(url);
    if (r.notFound || !r.data) return null;
    return parsePlSummary(r.data);
  } catch (err) {
    console.error(`\n  PL summary error for "${lemma}": ${err.message}`);
    return null;
  }
}

async function fetchEnTranslations(fetchTerm) {
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(fetchTerm)}&prop=wikitext&format=json&formatversion=2`;
  try {
    const r = await fetchJsonWithRetry(url);
    if (r.notFound) return [];
    const wikitext = r.data?.parse?.wikitext;
    return parsePolishTranslations(wikitext || '');
  } catch (err) {
    // Returning null here signals "fetch failed, retry on next sync";
    // returning [] would mean "fetched, no Polish translations on page".
    console.error(`\n  EN translations error for "${lemma}": ${err.message}`);
    return null;
  }
}

// ── Per-lemma sync (incremental) ───────────────────────────────────────────

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function syncOne(lemma, fetchTerm) {
  const slug = slugOf(lemma);
  const cachePath = join(CACHE_DIR, `${slug}.json`);

  let cache;
  let isNew = false;
  if (await fileExists(cachePath)) {
    cache = JSON.parse(await readFile(cachePath, 'utf8'));
  } else {
    cache = { lemma, slug };
    isNew = true;
  }

  let changed = isNew;
  let invalidated = false;
  let fetchedEn = false;
  let fetchedPl = false;
  let fetchedTr = false;

  // If the fetch term changed (proper-noun detection flipped, e.g. "polish"
  // -> "Polish"), drop the existing fields so they get re-fetched against
  // the correct Wiktionary page. Legacy caches without `fetchTerm` are
  // treated as if they were fetched with the lowercase lemma, which is true.
  const cachedFetchTerm = cache.fetchTerm || lemma;
  if (cachedFetchTerm !== fetchTerm) {
    delete cache.en;
    delete cache.pl;
    delete cache.translations;
    cache.fetchTerm = fetchTerm;
    invalidated = true;
    changed = true;
  } else if (cache.fetchTerm !== fetchTerm) {
    // Same value, but field missing — back-fill without invalidating data.
    cache.fetchTerm = fetchTerm;
    changed = true;
  }

  // EN definitions
  if (!('en' in cache)) {
    cache.en = await fetchEnDefinitions(fetchTerm);
    changed = true;
    fetchedEn = true;
    await sleep(RATE_LIMIT_MS);
  }

  // PL Wikisłownik summary
  if (!('pl' in cache)) {
    cache.pl = await fetchPlSummary(fetchTerm);
    changed = true;
    fetchedPl = true;
    await sleep(RATE_LIMIT_MS);
  }

  // EN-page Polish translations — retry on null (fetch error), not on []
  // (no-translation result is final).
  if (!('translations' in cache) || cache.translations === null) {
    cache.translations = await fetchEnTranslations(fetchTerm);
    changed = true;
    fetchedTr = true;
    await sleep(RATE_LIMIT_MS);
  }

  if (changed) {
    cache.fetchedAt = new Date().toISOString();
    await writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  }

  return {
    isNew,
    changed,
    invalidated,
    fetchedEn,
    fetchedPl,
    fetchedTr,
    hasEn: !!cache.en,
    hasPl: !!cache.pl,
    translationCount: Array.isArray(cache.translations) ? cache.translations.length : 0,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const lemmas = await collectLemmas();
  console.log(`Discovered ${lemmas.length} unique lemmas across all lessons.\n`);

  let newCount = 0,
    migratedCount = 0,
    invalidatedCount = 0,
    unchanged = 0,
    errored = 0;
  const errors = [];

  for (let i = 0; i < lemmas.length; i++) {
    const { lemma, fetchTerm } = lemmas[i];
    const pos = `[${String(i + 1).padStart(3)}/${lemmas.length}]`;
    const label = fetchTerm !== lemma ? `${lemma} → ${fetchTerm}` : lemma;
    process.stdout.write(`${pos} ${label.padEnd(32)}`);
    let r;
    try {
      r = await syncOne(lemma, fetchTerm);
    } catch (err) {
      errored++;
      errors.push({ lemma, msg: err.message });
      process.stdout.write(`  ✗ ${err.message}\n`);
      continue;
    }
    if (r.isNew) {
      newCount++;
      process.stdout.write(`  ✓ new   EN:${r.hasEn ? 'y' : '-'} PL:${r.hasPl ? 'y' : '-'} tr:${r.translationCount}\n`);
    } else if (r.invalidated) {
      invalidatedCount++;
      process.stdout.write(`  ↻ re-fetched (proper noun)  EN:${r.hasEn ? 'y' : '-'} PL:${r.hasPl ? 'y' : '-'} tr:${r.translationCount}\n`);
    } else if (r.changed) {
      migratedCount++;
      const tags = [];
      if (r.fetchedEn) tags.push('EN');
      if (r.fetchedPl) tags.push('PL');
      if (r.fetchedTr) tags.push(`tr:${r.translationCount}`);
      process.stdout.write(`  ↑ filled ${tags.join(' ')}\n`);
    } else {
      unchanged++;
      process.stdout.write(`  · cached\n`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  new:           ${newCount}`);
  console.log(`  back-filled:   ${migratedCount}`);
  console.log(`  re-fetched:    ${invalidatedCount}`);
  console.log(`  unchanged:     ${unchanged}`);
  console.log(`  errored:       ${errored}`);
  if (errors.length) {
    console.log(`\nErrored lemmas:`);
    for (const e of errors) console.log(`  - ${e.lemma}: ${e.msg}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
