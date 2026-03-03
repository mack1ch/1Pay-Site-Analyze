import { describe, it, expect } from 'vitest';
import {
  isValidHttpUrl,
  extractUrlFromLine,
  parseUrlsFromText,
  normalizeUrlForCrawl,
  sameOrigin,
  toAbsoluteUrl,
} from './url-utils.js';

describe('url-utils', () => {
  describe('isValidHttpUrl', () => {
    it('accepts http and https', () => {
      expect(isValidHttpUrl('https://example.com')).toBe(true);
      expect(isValidHttpUrl('http://example.com/path')).toBe(true);
    });
    it('rejects non-http', () => {
      expect(isValidHttpUrl('ftp://example.com')).toBe(false);
      expect(isValidHttpUrl('javascript:void(0)')).toBe(false);
      expect(isValidHttpUrl('not-a-url')).toBe(false);
    });
  });

  describe('extractUrlFromLine', () => {
    it('extracts URL from line', () => {
      expect(extractUrlFromLine('https://example.com')).toBe('https://example.com');
      expect(extractUrlFromLine('  https://example.com  ')).toBe('https://example.com');
      expect(extractUrlFromLine('see https://example.com/page')).toBe('https://example.com/page');
    });
    it('returns null for empty or invalid', () => {
      expect(extractUrlFromLine('')).toBeNull();
      expect(extractUrlFromLine('no url here')).toBeNull();
    });
  });

  describe('parseUrlsFromText', () => {
    it('parses and deduplicates URLs', () => {
      const text = 'https://a.com\nhttps://b.com\nhttps://a.com';
      expect(parseUrlsFromText(text)).toEqual(['https://a.com', 'https://b.com']);
    });
  });

  describe('normalizeUrlForCrawl', () => {
    it('lowercases host and strips fragment', () => {
      expect(normalizeUrlForCrawl('https://Example.COM/path#anchor')).toBe(
        'https://example.com/path'
      );
    });
    it('removes trailing slash from path', () => {
      expect(normalizeUrlForCrawl('https://example.com/')).toBe('https://example.com/');
      expect(normalizeUrlForCrawl('https://example.com/foo/')).toBe('https://example.com/foo');
    });
  });

  describe('sameOrigin', () => {
    it('returns true for same host', () => {
      const base = new URL('https://example.com');
      expect(sameOrigin(base, 'https://example.com/page')).toBe(true);
      expect(sameOrigin(base, 'https://example.com:443/')).toBe(true);
    });
    it('returns false for different host', () => {
      const base = new URL('https://example.com');
      expect(sameOrigin(base, 'https://other.com')).toBe(false);
    });
  });

  describe('toAbsoluteUrl', () => {
    it('resolves relative URL', () => {
      expect(toAbsoluteUrl('https://example.com/', '/page')).toBe('https://example.com/page');
    });
    it('ignores mailto and javascript', () => {
      expect(toAbsoluteUrl('https://example.com', 'mailto:a@b.com')).toBeNull();
      expect(toAbsoluteUrl('https://example.com', 'javascript:void(0)')).toBeNull();
    });
  });
});
