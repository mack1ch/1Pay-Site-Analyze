import { createRequire } from 'module';
import type { ForbiddenSettings, ForbiddenScanResult, MatchedTerm } from './types.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const snowballFactory = require('snowball-stemmers');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const damerauLevenshtein = require('damerau-levenshtein');

const DEFAULT_MIN_WORD_LENGTH = 3;
const DEFAULT_MAX_MATCHES_PER_TERM = 50;
const SNIPPET_CONTEXT_CHARS = 60;
const MAX_SNIPPETS = 3;
const FUZZY_MIN_LEN = 4;
const FUZZY_MAX_LEN = 20;

let stemmerRu: { stem: (w: string) => string } | null = null;
let stemmerEn: { stem: (w: string) => string } | null = null;

function getStemmer(lang: 'ru' | 'en') {
  if (lang === 'ru') {
    if (!stemmerRu) stemmerRu = snowballFactory.newStemmer('russian');
    return stemmerRu;
  }
  if (!stemmerEn) stemmerEn = snowballFactory.newStemmer('english');
  return stemmerEn;
}

function stem(word: string, lang: 'ru' | 'en'): string {
  const s = getStemmer(lang);
  if (!s) throw new Error('Stemmer not initialized');
  return s.stem(word);
}

/** Unicode-aware tokenization: split into words (letters only). */
export function tokenize(text: string): string[] {
  const matches = text.match(/\p{L}+/gu);
  return matches ? [...matches] : [];
}

/** Detect language from token: if has Cyrillic -> ru, else en. */
function detectLang(token: string): 'ru' | 'en' {
  return /\p{Script=Cyrillic}/u.test(token) ? 'ru' : 'en';
}

export interface ScanInput {
  text: string;
  terms: string[];
  settings: ForbiddenSettings;
}

function normalizeForMatch(token: string, caseSensitive: boolean): string {
  return caseSensitive ? token : token.toLowerCase();
}

function extractSnippets(
  text: string,
  searchStr: string,
  caseSensitive: boolean,
  maxSnippets: number
): Array<{ snippet: string }> {
  const out: Array<{ snippet: string }> = [];
  const lowerText = caseSensitive ? text : text.toLowerCase();
  const lowerSearch = caseSensitive ? searchStr : searchStr.toLowerCase();
  let idx = lowerText.indexOf(lowerSearch);
  let count = 0;
  while (idx >= 0 && count < maxSnippets) {
    const start = Math.max(0, idx - SNIPPET_CONTEXT_CHARS);
    const end = Math.min(text.length, idx + searchStr.length + SNIPPET_CONTEXT_CHARS);
    let snip = text.slice(start, end);
    if (start > 0) snip = '…' + snip;
    if (end < text.length) snip = snip + '…';
    out.push({ snippet: snip });
    count++;
    idx = lowerText.indexOf(lowerSearch, idx + 1);
  }
  return out;
}

/** Find snippet around token at position in token list (use original text positions). */
function snippetAroundToken(
  text: string,
  token: string,
  caseSensitive: boolean,
  maxSnippets: number
): Array<{ snippet: string }> {
  const out: Array<{ snippet: string }> = [];
  const re = new RegExp(
    caseSensitive ? escapeRe(token) : escapeRe(token).replace(/([a-zA-Zа-яА-ЯёЁ])/g, (m) => `[${m.toLowerCase()}${m.toUpperCase()}]`),
    caseSensitive ? 'g' : 'gi'
  );
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(text)) !== null && count < maxSnippets) {
    const start = Math.max(0, m.index - SNIPPET_CONTEXT_CHARS);
    const end = Math.min(text.length, m.index + m[0].length + SNIPPET_CONTEXT_CHARS);
    let snip = text.slice(start, end);
    if (start > 0) snip = '…' + snip;
    if (end < text.length) snip = snip + '…';
    out.push({ snippet: snip });
    count++;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scanForbidden(input: ScanInput): ForbiddenScanResult {
  const { text, terms, settings } = input;
  const minWordLength = settings.minWordLength ?? DEFAULT_MIN_WORD_LENGTH;
  const maxMatchesPerTerm = settings.maxMatchesPerTermPerPage ?? DEFAULT_MAX_MATCHES_PER_TERM;
  const caseSensitive = settings.caseSensitive ?? false;
  const matchMode = settings.matchMode ?? 'smart_stem';
  const languageMode = settings.languageMode ?? 'auto';
  const phraseMode = settings.phraseMode ?? 'disabled';
  const fuzzyEnabled = settings.fuzzy?.enabled ?? false;
  const fuzzyMaxDistance = settings.fuzzy?.maxDistance ?? 1;
  const fuzzyMaxTokens = settings.fuzzy?.maxTokensChecked ?? 5000;

  const matchedTerms: MatchedTerm[] = [];
  const lang = languageMode === 'auto' ? undefined : languageMode;

  const tokens = tokenize(text);
  const filteredTokens = tokens.filter((t) => t.length >= minWordLength);
  const normalizedTokens = filteredTokens.map((t) => normalizeForMatch(t, caseSensitive));

  const tokenCount = new Map<string, number>();
  for (const t of normalizedTokens) {
    tokenCount.set(t, (tokenCount.get(t) || 0) + 1);
  }

  const stemCache = new Map<string, string>();
  const stemCount = new Map<string, number>();

  function getStemForToken(t: string): string {
    let s = stemCache.get(t);
    if (s === undefined) {
      const l = lang ?? (/\p{Script=Cyrillic}/u.test(t) ? 'ru' : 'en');
      s = stem(t, l);
      stemCache.set(t, s);
    }
    return s;
  }

  for (const t of normalizedTokens) {
    const s = getStemForToken(t);
    stemCount.set(s, (stemCount.get(s) || 0) + tokenCount.get(t)!);
  }

  const pageStems: string[] = [];
  for (const t of normalizedTokens) {
    pageStems.push(getStemForToken(t));
  }

  for (const rawTerm of terms) {
    const term = rawTerm.trim();
    if (!term) continue;

    const termTokens = tokenize(term).filter((t) => t.length >= minWordLength);
    // Многословный термин («интернет магазины») всегда проверяем как фразу по последовательности основ,
    // чтобы находить и «интернет-магазинов», и «интернет магазинов» и т.п.
    const isPhrase = termTokens.length > 1;

    if (isPhrase) {
      const phraseStems = termTokens.map((t) => {
        const norm = normalizeForMatch(t, caseSensitive);
        return getStemForToken(norm);
      });
      let count = 0;
      for (let i = 0; i <= pageStems.length - phraseStems.length; i++) {
        let match = true;
        for (let j = 0; j < phraseStems.length; j++) {
          if (pageStems[i + j] !== phraseStems[j]) {
            match = false;
            break;
          }
        }
        if (match) count++;
        if (count >= maxMatchesPerTerm) break;
      }
      if (count > 0) {
        const snippets = extractSnippets(text, term, caseSensitive, MAX_SNIPPETS);
        matchedTerms.push({
          term,
          count,
          matchType: 'phrase',
          normalizedTerm: phraseStems.join(' '),
          snippets: snippets.length ? snippets : undefined,
        });
      }
      continue;
    }

    const normTerm = normalizeForMatch(term, caseSensitive);
    const stemTerm = getStemForToken(normTerm);

    let count = 0;
    let matchType: MatchedTerm['matchType'] = 'exact_substring';
    let normalizedTerm: string | undefined;
    let snippets: Array<{ snippet: string }> | undefined;

    if (matchMode === 'exact_substring') {
      const re = caseSensitive
        ? new RegExp(escapeRe(term), 'g')
        : new RegExp(escapeRe(term), 'gi');
      const matches = text.match(re);
      count = matches ? Math.min(matches.length, maxMatchesPerTerm) : 0;
      if (count > 0) snippets = extractSnippets(text, term, caseSensitive, MAX_SNIPPETS);
    } else if (matchMode === 'word') {
      count = tokenCount.get(normTerm) || 0;
      count = Math.min(count, maxMatchesPerTerm);
      matchType = 'word';
      if (count > 0) snippets = snippetAroundToken(text, term, caseSensitive, MAX_SNIPPETS);
    } else if (matchMode === 'smart_stem' || matchMode === 'smart_fuzzy') {
      count = stemCount.get(stemTerm) || 0;
      if (count > 0) {
        count = Math.min(count, maxMatchesPerTerm);
        normalizedTerm = stemTerm;
        matchType = 'smart_stem';
        const firstToken = normalizedTokens.find((t) => getStemForToken(t) === stemTerm);
        if (firstToken) snippets = snippetAroundToken(text, firstToken, caseSensitive, MAX_SNIPPETS);
      } else if (
        (matchMode === 'smart_fuzzy' || fuzzyEnabled) &&
        term.length >= FUZZY_MIN_LEN &&
        term.length <= FUZZY_MAX_LEN
      ) {
        const uniqueTokens = [...new Set(normalizedTokens)];
        const toCheck =
          fuzzyMaxTokens > 0 && uniqueTokens.length > fuzzyMaxTokens
            ? uniqueTokens.slice(0, fuzzyMaxTokens)
            : uniqueTokens;
        let fuzzyCount = 0;
        for (const t of toCheck) {
          if (t.length < FUZZY_MIN_LEN || t.length > FUZZY_MAX_LEN) continue;
          const dist = damerauLevenshtein(normTerm, t);
          if (dist <= fuzzyMaxDistance) {
            fuzzyCount += tokenCount.get(t) || 0;
            if (fuzzyCount >= maxMatchesPerTerm) break;
          }
        }
        if (fuzzyCount > 0) {
          count = Math.min(fuzzyCount, maxMatchesPerTerm);
          matchType = 'smart_fuzzy';
          normalizedTerm = stemTerm;
          const firstFuzzy = toCheck.find(
            (t) =>
              t.length >= FUZZY_MIN_LEN &&
              t.length <= FUZZY_MAX_LEN &&
              damerauLevenshtein(normTerm, t) <= fuzzyMaxDistance
          );
          if (firstFuzzy)
            snippets = snippetAroundToken(text, firstFuzzy, caseSensitive, MAX_SNIPPETS);
        }
      }
    }

    if (count > 0) {
      matchedTerms.push({
        term,
        count,
        matchType,
        normalizedTerm,
        snippets,
      });
    }
  }

  matchedTerms.sort((a, b) => b.count - a.count);
  const totalMatches = matchedTerms.reduce((s, m) => s + m.count, 0);

  return {
    hasMatches: matchedTerms.length > 0,
    totalMatches,
    matchedTerms,
  };
}
