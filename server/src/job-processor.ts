import pLimit from 'p-limit';
import { getHostnameFromURL, resolveAndCheckSSRF } from './ssrf.js';
import { fetchHtml } from './fetch-html.js';
import { fetchHtmlWithBrowser } from './fetch-html-browser.js';
import { fetchSSLCertDates } from './ssl-cert.js';
import { extractReadableText } from './extract-text.js';
import { createPlaywrightPool, takeScreenshot } from './screenshot.js';
import { extractLinksFromHtml, filterLinks, crawlBfs, type CrawlOptions } from './crawler.js';
import { scanForbidden } from './forbidden-scanner.js';
import {
  getJob,
  updateJobProgress,
  appendResult,
  incrementJobProgress,
  setJobSummary,
} from './job-store.js';
import { saveReportToHistory } from './db.js';
import { delayBeforeRequest } from './access-profile.js';
import type { ResultItem, JobOptions } from './types.js';
import { config } from './config.js';

const SCREENSHOT_STATIC_PREFIX = '/static/screenshots/';

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  signal?: AbortSignal
): Promise<T> {
  let lastErr: Error | undefined;
  for (let i = 0; i <= retries; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await fn();
    } catch (e) {
      lastErr = e as Error;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

export async function runJob(
  jobId: string,
  mode: 'list' | 'crawl',
  urls: string[],
  crawlOpts: CrawlOptions | null,
  opts: JobOptions,
  signal?: AbortSignal
): Promise<void> {
  const job = getJob(jobId);
  if (!job || job.cancelled) return;

  const concurrency =
    opts.concurrencyFetch ?? opts.concurrency ?? config.concurrency.fetch;
  const screenshotConcurrency =
    opts.concurrencyScreenshots ?? opts.maxConcurrentScreenshots ?? config.concurrency.screenshots;
  const fetchTimeout = opts.fetchTimeoutMs ?? config.fetch.timeoutMs;
  const playwrightTimeout = opts.playwrightTimeoutMs ?? config.playwright.navigationTimeoutMs;
  const maxTextChars = opts.maxChars ?? opts.maxTextChars ?? config.fetch.maxTextChars;
  const maxResponseBytes = opts.maxResponseBytes ?? config.fetch.maxResponseBytes;
  const screenshotEnabled = opts.screenshot?.enabled !== false;
  const fullPageScreenshot =
    opts.screenshot?.fullPage ?? opts.fullPageScreenshot ?? config.playwright.fullPageScreenshot;
  const useBrowserFetch = opts.useBrowserFetch === true;
  const forbiddenOpts = opts.forbidden;
  const access = opts.access;

  let requestIndex = 0;
  const fetchLimit = pLimit(concurrency);
  let screenshotPool: Awaited<ReturnType<typeof createPlaywrightPool>> | null = null;
  const screenshotLimit = pLimit(screenshotConcurrency);

  const takeScreenshotSafe = async (
    url: string,
    finalUrl: string,
    options?: { fullPage?: boolean; highlightTerms?: Array<{ term: string }> }
  ): Promise<string | undefined> => {
    if (!screenshotPool) return undefined;
    return screenshotLimit(async () => {
      const page = await screenshotPool!.acquirePage();
      try {
        const result = await takeScreenshot(page, finalUrl, {
          fullPage: options?.fullPage ?? fullPageScreenshot,
          highlightTerms: options?.highlightTerms,
          viewport: screenshotPool!.viewport,
        });
        await screenshotPool!.releasePage(page);
        if ('error' in result) {
          console.warn(`[screenshot] failed for ${finalUrl}: ${result.error}`);
          return undefined;
        }
        return SCREENSHOT_STATIC_PREFIX + result.filename;
      } catch (err) {
        await screenshotPool!.releasePage(page);
        console.warn('[screenshot] error for', finalUrl, err);
        return undefined;
      }
    });
  };

  const processOne = async (url: string, html?: string): Promise<{ html: string } | null> => {
    if (signal?.aborted || job.cancelled) return null;
    await delayBeforeRequest(access);
    const idx = requestIndex++;
    const hostname = getHostnameFromURL(url);
    if (!hostname) {
      appendResult(jobId, { url, ok: false, error: 'Некорректный URL' });
      incrementJobProgress(jobId, 1, 1);
      return null;
    }
    const ssrf = await resolveAndCheckSSRF(hostname);
    if (!ssrf.ok) {
      appendResult(jobId, { url, ok: false, error: ssrf.error });
      incrementJobProgress(jobId, 1, 1);
      return null;
    }

    let fetched = html;
    let statusCode: number | undefined;
    let finalUrl = url;

    if (!fetched) {
      let res: Awaited<ReturnType<typeof fetchHtml>>;
      if (useBrowserFetch && screenshotPool) {
        res = await fetchLimit(async () => {
          const page = await screenshotPool!.acquirePage();
          try {
            return await fetchHtmlWithBrowser(page, url, { timeoutMs: playwrightTimeout });
          } finally {
            await screenshotPool!.releasePage(page);
          }
        });
      } else {
        res = await fetchLimit(() =>
          withRetry(
            () =>
              fetchHtml(url, signal, {
                timeoutMs: fetchTimeout,
                maxBytes: maxResponseBytes,
                access,
                requestIndex: idx,
              }),
            config.fetch.retries,
            signal
          )
        );
      }
      if (signal?.aborted || job.cancelled) return null;
      if (!res.ok) {
        const blockedBySite = [401, 403, 429, 503].includes(res.statusCode ?? 0);
        appendResult(jobId, {
          url,
          ok: false,
          statusCode: res.statusCode,
          finalUrl: res.finalUrl,
          error: res.error,
          note: res.note,
          blockedBySite,
        });
        incrementJobProgress(jobId, 1, 1);
        return null;
      }
      finalUrl = res.finalUrl ?? url;
      const finalHost = getHostnameFromURL(finalUrl);
      if (finalHost) {
        const finalSsrf = await resolveAndCheckSSRF(finalHost);
        if (!finalSsrf.ok) {
          appendResult(jobId, { url, ok: false, finalUrl, error: finalSsrf.error });
          incrementJobProgress(jobId, 1, 1);
          return null;
        }
      }
      fetched = res.html;
      statusCode = res.statusCode;
    }

    if (!fetched) {
      appendResult(jobId, { url, ok: false, finalUrl, error: 'Нет HTML' });
      incrementJobProgress(jobId, 1, 1);
      return null;
    }

    const isHtml = /<html|<!doctype/i.test(fetched);
    if (!isHtml) {
      appendResult(jobId, {
        url,
        ok: true,
        statusCode,
        finalUrl,
        note: 'Не HTML',
      });
      incrementJobProgress(jobId, 1, 0);
      return null;
    }

    const { title, text, truncated } = extractReadableText(fetched, finalUrl, maxTextChars);

    let forbiddenScan: Awaited<ReturnType<typeof scanForbidden>> | undefined;
    if (forbiddenOpts?.terms?.length && text) {
      forbiddenScan = scanForbidden({
        text,
        terms: forbiddenOpts.terms,
        settings: forbiddenOpts.settings ?? {},
      });
    }

    let sslValidFrom: string | undefined;
    let sslValidTo: string | undefined;
    if (finalUrl.startsWith('https://')) {
      const cert = await fetchSSLCertDates(finalUrl);
      if (cert) {
        sslValidFrom = cert.validFrom;
        sslValidTo = cert.validTo;
      }
    }

    let screenshotUrl: string | undefined;
    const hostnameFinal = getHostnameFromURL(finalUrl);
    if (hostnameFinal && screenshotEnabled) {
      const ssrfFinal = await resolveAndCheckSSRF(hostnameFinal);
      if (ssrfFinal.ok) {
        const highlightTerms =
          forbiddenScan?.hasMatches ?
            forbiddenScan.matchedTerms.map((m) => ({ term: m.term }))
          : undefined;
        screenshotUrl = await takeScreenshotSafe(url, finalUrl, {
          fullPage: fullPageScreenshot,
          highlightTerms,
        });
      }
    }

    appendResult(jobId, {
      url,
      ok: true,
      statusCode,
      finalUrl,
      title,
      text,
      textLength: text.length,
      truncated,
      screenshotUrl,
      sslValidFrom,
      sslValidTo,
      forbiddenScan,
    });
    incrementJobProgress(jobId, 1, 0);

    return { html: fetched };
  };

  if (screenshotEnabled || useBrowserFetch) {
    try {
      screenshotPool = await createPlaywrightPool(screenshotConcurrency, access);
    } catch (e) {
      updateJobProgress(jobId, { status: 'failed' });
      return;
    }
  }

  try {
    updateJobProgress(jobId, { status: 'running' });

    if (mode === 'list') {
      for (const url of urls) {
        if (signal?.aborted || job.cancelled) break;
        await fetchLimit(() => processOne(url));
      }
    } else if (mode === 'crawl' && crawlOpts) {
      if (crawlOpts.crawlMode === 'submitted_only') {
        for (const url of crawlOpts.seedUrls) {
          if (signal?.aborted || job.cancelled) break;
          await fetchLimit(() => processOne(url));
        }
      } else {
        const getLinks = (baseUrl: string, htmlContent: string) =>
          filterLinks(extractLinksFromHtml(htmlContent, baseUrl), baseUrl, crawlOpts);
        const gen = crawlBfs(crawlOpts.seedUrls, getLinks, crawlOpts);
        let result = gen.next();
        while (!result.done) {
          if (signal?.aborted || job.cancelled) break;
          const item = result.value;
          const processed = await fetchLimit(async () => processOne(item.url));
          if (processed) {
            result = gen.next({ url: item.url, html: processed.html });
          } else {
            result = gen.next(undefined);
          }
        }
      }
    }

    const finalJob = getJob(jobId);
    if (finalJob && !finalJob.cancelled) {
      updateJobProgress(jobId, { status: 'done' });
      setJobSummary(jobId);
      const jobAfterSummary = getJob(jobId);
      if (jobAfterSummary) {
        saveReportToHistory(jobId, jobAfterSummary).catch((err) =>
          console.warn('[job] saveReportToHistory failed:', err)
        );
      }
    }
  } finally {
    if (screenshotPool) await screenshotPool.close();
  }
}

export function buildCrawlOptions(seedUrls: string[], opts: JobOptions): CrawlOptions {
  const crawlInput = opts.crawl;
  const maxPages =
    crawlInput?.maxPages ?? opts.maxPages ?? config.crawl.maxPages;
  const maxDepth =
    crawlInput?.maxDepth ?? opts.maxDepth ?? config.crawl.maxDepth;
  const sameHostOnly =
    crawlInput?.sameHostOnly ?? opts.sameHostOnly ?? config.crawl.sameHostOnly;
  const crawlMode = crawlInput?.crawlMode ?? opts.crawlMode ?? 'crawl';
  return {
    seedUrls,
    maxPages: crawlMode === 'seed_only' ? 1 : maxPages,
    maxDepth: crawlMode === 'seed_only' ? 0 : maxDepth,
    sameHostOnly,
    crawlMode,
    allowPattern: opts.allowPattern,
    denyPattern: opts.denyPattern,
    excludeQueryStrings: opts.excludeQueryStrings,
    includePatterns: crawlInput?.includePatterns,
    excludePatterns: crawlInput?.excludePatterns,
  };
}
