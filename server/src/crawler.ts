import { JSDOM } from 'jsdom';
import type { CrawlMode } from './types.js';
import { normalizeUrlForCrawl, sameOrigin, toAbsoluteUrl } from './url-utils.js';

export interface CrawlOptions {
  seedUrls: string[];
  maxPages: number;
  maxDepth: number;
  sameHostOnly: boolean;
  crawlMode: CrawlMode;
  allowPattern?: string;
  denyPattern?: string;
  excludeQueryStrings?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = (a as HTMLAnchorElement).getAttribute('href');
    if (!href) continue;
    const absolute = toAbsoluteUrl(baseUrl, href);
    if (!absolute) continue;
    const normalized = normalizeUrlForCrawl(absolute);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function compilePatterns(patterns: string[] | undefined): RegExp[] | null {
  if (!patterns?.length) return null;
  const out: RegExp[] = [];
  for (const p of patterns) {
    try {
      out.push(new RegExp(p.trim()));
    } catch {
      // skip invalid regex
    }
  }
  return out.length ? out : null;
}

export function filterLinks(links: string[], baseUrl: string, options: CrawlOptions): string[] {
  const base = new URL(baseUrl);
  const allowRe = options.allowPattern ? new RegExp(options.allowPattern) : null;
  const denyRe = options.denyPattern ? new RegExp(options.denyPattern) : null;
  const includeReList = compilePatterns(options.includePatterns);
  const excludeReList = compilePatterns(options.excludePatterns);
  return links.filter((url) => {
    if (options.sameHostOnly && !sameOrigin(base, url)) return false;
    if (allowRe && !allowRe.test(url)) return false;
    if (denyRe && denyRe.test(url)) return false;
    if (includeReList?.length && !includeReList.some((re) => re.test(url))) return false;
    if (excludeReList?.length && excludeReList.some((re) => re.test(url))) return false;
    return true;
  });
}

export interface CrawlQueueItem {
  url: string;
  depth: number;
}

export function* crawlBfs(
  initialUrls: string[],
  getLinks: (url: string, html: string) => string[],
  options: CrawlOptions
): Generator<CrawlQueueItem, void, { url: string; html: string } | undefined> {
  const visited = new Set<string>();
  const queue: CrawlQueueItem[] = initialUrls.map((url) => ({
    url: normalizeUrlForCrawl(url),
    depth: 0,
  }));
  let processed = 0;

  while (queue.length > 0 && processed < options.maxPages) {
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    if (item.depth > options.maxDepth) continue;
    visited.add(item.url);
    processed++;
    const next = yield item;
    if (!next || next.url !== item.url) continue;
    const links = getLinks(next.url, next.html);
    const filtered = filterLinks(links, next.url, options);
    for (const link of filtered) {
      const norm = normalizeUrlForCrawl(link);
      if (!visited.has(norm)) {
        queue.push({ url: norm, depth: item.depth + 1 });
      }
    }
  }
}
