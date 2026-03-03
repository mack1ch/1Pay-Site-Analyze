import { describe, it, expect } from 'vitest';
import { isBlockedIP, getHostnameFromURL } from './ssrf.js';

describe('ssrf', () => {
  describe('isBlockedIP', () => {
    it('blocks localhost and private ranges', () => {
      expect(isBlockedIP('127.0.0.1')).toBe(true);
      expect(isBlockedIP('::1')).toBe(true);
      expect(isBlockedIP('10.0.0.1')).toBe(true);
      expect(isBlockedIP('172.16.0.1')).toBe(true);
      expect(isBlockedIP('192.168.1.1')).toBe(true);
      expect(isBlockedIP('169.254.169.254')).toBe(true);
    });
    it('allows public IPs', () => {
      expect(isBlockedIP('8.8.8.8')).toBe(false);
      expect(isBlockedIP('1.1.1.1')).toBe(false);
    });
  });

  describe('getHostnameFromURL', () => {
    it('extracts hostname', () => {
      expect(getHostnameFromURL('https://example.com/path')).toBe('example.com');
    });
    it('returns null for invalid URL', () => {
      expect(getHostnameFromURL('not-a-url')).toBeNull();
    });
  });
});
