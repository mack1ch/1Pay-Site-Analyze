import { describe, it, expect } from 'vitest';
import { extractLinksFromHtml, filterLinks, crawlBfs, type CrawlOptions } from './crawler.js';

describe('crawler', () => {
  const baseUrl = 'https://example.com/page';

  describe('extractLinksFromHtml', () => {
    it('extracts and normalizes links', () => {
      const html = `
        <html><body>
          <a href="/foo">Foo</a>
          <a href="https://example.com/bar">Bar</a>
          <a href="mailto:x@y.com">Mail</a>
        </body></html>`;
      const links = extractLinksFromHtml(html, baseUrl);
      expect(links).toContain('https://example.com/foo');
      expect(links).toContain('https://example.com/bar');
      expect(links.some((l) => l.includes('mailto'))).toBe(false);
    });
  });

  describe('filterLinks', () => {
    const opts: CrawlOptions = {
      seedUrls: [baseUrl],
      maxPages: 10,
      maxDepth: 2,
      sameHostOnly: true,
      crawlMode: 'crawl',
    };

    it('filters same host when sameHostOnly', () => {
      const links = ['https://example.com/a', 'https://other.com/b'];
      expect(filterLinks(links, baseUrl, opts)).toEqual(['https://example.com/a']);
    });

    it('applies allow pattern when set', () => {
      const links = ['https://example.com/ok', 'https://example.com/skip'];
      expect(filterLinks(links, baseUrl, { ...opts, allowPattern: '/ok' })).toEqual([
        'https://example.com/ok',
      ]);
    });

    it('applies includePatterns and excludePatterns', () => {
      const links = [
        'https://example.com/a',
        'https://example.com/b',
        'https://example.com/admin',
      ];
      const withExclude = filterLinks(links, baseUrl, {
        ...opts,
        excludePatterns: ['/admin'],
      });
      expect(withExclude).toContain('https://example.com/a');
      expect(withExclude).not.toContain('https://example.com/admin');
    });
  });

  describe('crawlBfs', () => {
    it('yields seed and accepts html to discover more', () => {
      const getLinks = (url: string, html: string) => {
        if (url.includes('page')) return ['https://example.com/page2'];
        return [];
      };
      const opts: CrawlOptions = {
        seedUrls: ['https://example.com/page'],
        maxPages: 5,
        maxDepth: 2,
        sameHostOnly: true,
        crawlMode: 'crawl',
      };
      const gen = crawlBfs(['https://example.com/page'], getLinks, opts);
      const first = gen.next();
      expect(first.done).toBe(false);
      expect(first.value).toEqual({ url: 'https://example.com/page', depth: 0 });
      const second = gen.next({
        url: first.value!.url,
        html: '<html><body><a href="/page2">x</a></body></html>',
      });
      expect(second.done).toBe(false);
      expect(second.value?.url).toContain('page2');
    });
  });
});
