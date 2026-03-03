import { describe, it, expect } from 'vitest';
import { tokenize, scanForbidden } from './forbidden-scanner.js';

describe('forbidden-scanner', () => {
  describe('tokenize', () => {
    it('splits Cyrillic and Latin words', () => {
      const tokens = tokenize('Привет world арбуз test');
      expect(tokens).toContain('Привет');
      expect(tokens).toContain('world');
      expect(tokens).toContain('арбуз');
      expect(tokens).toContain('test');
      expect(tokens).toHaveLength(4);
    });

    it('ignores non-letters (only Unicode letters are tokens)', () => {
      const tokens = tokenize('word  word!');
      expect(tokens).toEqual(['word', 'word']);
    });
  });

  describe('scanForbidden', () => {
    it('exact_substring finds substring', () => {
      const result = scanForbidden({
        text: 'Hello forbidden word here',
        terms: ['forbidden'],
        settings: { matchMode: 'exact_substring' },
      });
      expect(result.hasMatches).toBe(true);
      expect(result.totalMatches).toBe(1);
      expect(result.matchedTerms[0].term).toBe('forbidden');
      expect(result.matchedTerms[0].matchType).toBe('exact_substring');
    });

    it('word mode matches whole word only', () => {
      const result = scanForbidden({
        text: 'foo bar foo bar',
        terms: ['foo'],
        settings: { matchMode: 'word' },
      });
      expect(result.hasMatches).toBe(true);
      expect(result.matchedTerms[0].count).toBe(2);
      expect(result.matchedTerms[0].matchType).toBe('word');
    });

    it('smart_stem finds stem match (Russian)', () => {
      const result = scanForbidden({
        text: 'арбузы и арбузами продаём',
        terms: ['арбуз'],
        settings: { matchMode: 'smart_stem', languageMode: 'ru' },
      });
      expect(result.hasMatches).toBe(true);
      expect(result.matchedTerms[0].term).toBe('арбуз');
      expect(result.matchedTerms[0].matchType).toBe('smart_stem');
      expect(result.matchedTerms[0].count).toBeGreaterThanOrEqual(1);
    });

    it('smart_stem finds stem match (English)', () => {
      const result = scanForbidden({
        text: 'running runner runs',
        terms: ['run'],
        settings: { matchMode: 'smart_stem', languageMode: 'en' },
      });
      expect(result.hasMatches).toBe(true);
      expect(result.matchedTerms[0].term).toBe('run');
      expect(result.matchedTerms[0].matchType).toBe('smart_stem');
    });

    it('respects minWordLength', () => {
      const result = scanForbidden({
        text: 'ab abc abcd',
        terms: ['ab'],
        settings: { matchMode: 'word', minWordLength: 3 },
      });
      expect(result.hasMatches).toBe(false);
    });

    it('returns no match when term not in text', () => {
      const result = scanForbidden({
        text: 'nothing here',
        terms: ['missing'],
        settings: { matchMode: 'word' },
      });
      expect(result.hasMatches).toBe(false);
      expect(result.matchedTerms).toHaveLength(0);
    });
  });
});
