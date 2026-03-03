import { describe, it, expect } from 'vitest';
import { parseCsvUrls } from './csv.js';

describe('parseCsvUrls', () => {
  it('detects url column and comma delimiter', () => {
    const csv = 'name,url,title\nFoo,https://a.com,Page A\nBar,https://b.com,Page B';
    expect(parseCsvUrls(csv)).toEqual(['https://a.com', 'https://b.com']);
  });

  it('detects link column', () => {
    const csv = 'link\nhttps://x.com';
    expect(parseCsvUrls(csv)).toEqual(['https://x.com']);
  });

  it('uses first column when no url/link header', () => {
    const csv = 'col1,col2\nhttps://first.com,other';
    expect(parseCsvUrls(csv)).toEqual(['https://first.com']);
  });

  it('handles semicolon delimiter', () => {
    const csv = 'url;name\nhttps://s.com;S';
    expect(parseCsvUrls(csv)).toEqual(['https://s.com']);
  });

  it('handles tab delimiter', () => {
    const csv = 'url\tname\nhttps://t.com\tT';
    expect(parseCsvUrls(csv)).toEqual(['https://t.com']);
  });

  it('deduplicates and skips non-URLs', () => {
    const csv = 'url\nhttps://a.com\nnot-url\nhttps://a.com';
    expect(parseCsvUrls(csv)).toEqual(['https://a.com']);
  });
});
