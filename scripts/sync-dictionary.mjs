#!/usr/bin/env node
// Sync script: fetches Wiktionary entries (EN definitions + PL summary)
// for every lemma appearing in src/content/lessons/*.json and caches
// them in src/data/wiktionary/<slug>.json.
//
// Idempotent: only fetches lemmas that don't have a cache file yet.
// Re-run safely after adding new lessons.
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

const RATE_LIMIT_MS = 250;   // ~4 req/s, well under MediaWiki's 200 req/s limit
const MAX_DEFINITIONS = 3;
const MAX_EXAMPLES = 2;

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

// ── Lemma discovery ────────────────────────────────────────────────────────

async function collectLemmas() {
  const lemmas = new Set();
  const files = await readdir(LESSONS_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(LESSONS_DIR, file), 'utf8');
    const data = JSON.parse(raw);
    if (!data.levels) continue;
    for (const level of Object.values(data.levels)) {
      if (!level) continue;
      if (typeof level.text === 'string') {
        for (const l of uniqueLemmasInText(level.text)) lemmas.add(l);
      }
      if (Array.isArray(level.vocab)) {
        for (const v of level.vocab) {
          if (typeof v.term !== 'string') continue;
          if (/\s/.test(v.term)) continue;
          const l = lemmaOf(v.term);
          if (slugOf(l)) lemmas.add(l);
        }
      }
    }
  }
  return [...lemmas].sort();
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
  });
  if (res.status === 404) return { notFound: true };
  if (res.status === 429) {
    const wait = parseInt(res.headers.get('retry-after') || '5', 10) * 1000;
    return { rateLimited: true, wait };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return { data: await res.json() };
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

/**
 * Extract structured definitions from the EN Wiktionary REST response.
 * Shape: { en: [{ partOfSpeech, language, definitions: [{ definition, examples? }] }] }
 */
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
    out.push({
      partOfSpeech: entry.partOfSpeech || '',
      definitions: defs,
    });
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

// ── Per-lemma sync ─────────────────────────────────────────────────────────

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function syncOne(lemma) {
  const slug = slugOf(lemma);
  const cachePath = join(CACHE_DIR, `${slug}.json`);
  if (await fileExists(cachePath)) {
    return { status: 'cached' };
  }

  const enUrl = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(lemma)}`;
  const plUrl = `https://pl.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(lemma)}`;

  let en = null;
  let pl = null;

  // ── EN
  try {
    let r = await fetchJson(enUrl);
    if (r.rateLimited) {
      await sleep(r.wait);
      r = await fetchJson(enUrl);
    }
    if (!r.notFound && r.data) en = parseEnDefinition(r.data);
  } catch (err) {
    console.error(`\n  EN error for "${lemma}": ${err.message}`);
  }
  await sleep(RATE_LIMIT_MS);

  // ── PL
  try {
    let r = await fetchJson(plUrl);
    if (r.rateLimited) {
      await sleep(r.wait);
      r = await fetchJson(plUrl);
    }
    if (!r.notFound && r.data) pl = parsePlSummary(r.data);
  } catch (err) {
    console.error(`\n  PL error for "${lemma}": ${err.message}`);
  }

  const cache = {
    lemma,
    slug,
    fetchedAt: new Date().toISOString(),
    en,
    pl,
  };
  await writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8');

  return { status: en || pl ? 'fetched' : 'empty', en: !!en, pl: !!pl };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const lemmas = await collectLemmas();
  console.log(`Discovered ${lemmas.length} unique lemmas across all lessons.`);

  let fetched = 0,
    cached = 0,
    empty = 0,
    errors = 0;
  const errored = [];

  for (let i = 0; i < lemmas.length; i++) {
    const lemma = lemmas[i];
    const pos = `[${String(i + 1).padStart(3)}/${lemmas.length}]`;
    process.stdout.write(`${pos} ${lemma.padEnd(28)}`);
    let result;
    try {
      result = await syncOne(lemma);
    } catch (err) {
      errors++;
      errored.push({ lemma, err: err.message });
      process.stdout.write(`  ✗ ${err.message}\n`);
      continue;
    }
    if (result.status === 'cached') {
      cached++;
      process.stdout.write(`  · cached\n`);
    } else if (result.status === 'fetched') {
      fetched++;
      process.stdout.write(`  ✓ EN:${result.en ? 'y' : '-'} PL:${result.pl ? 'y' : '-'}\n`);
      await sleep(RATE_LIMIT_MS);
    } else {
      empty++;
      process.stdout.write(`  – not found\n`);
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(`\nDone. Fetched: ${fetched}, cached (skipped): ${cached}, empty: ${empty}, errors: ${errors}`);
  if (errored.length) {
    console.log('\nErrored lemmas:');
    for (const e of errored) console.log(`  - ${e.lemma}: ${e.err}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
