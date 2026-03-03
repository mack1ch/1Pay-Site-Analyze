/** Часовой пояс по умолчанию для расписаний и отображения (cron, даты). */
export const DEFAULT_TIMEZONE = 'Europe/Moscow';

export const config = {
  defaultTimezone: DEFAULT_TIMEZONE,
  fetch: {
    timeoutMs: 25_000,
    maxRedirects: 10,
    maxResponseBytes: 10 * 1024 * 1024, // 10MB
    maxTextChars: 300_000,
    retries: 2,
    retryDelayMs: 1000,
  },
  concurrency: {
    fetch: 8,
    screenshots: 3,
  },
  playwright: {
    navigationTimeoutMs: 35_000,
    viewport: { width: 1280, height: 720 },
    fullPageScreenshot: true,
  },
  crawl: {
    maxPages: 100,
    maxDepth: 3,
    sameHostOnly: true,
  },
} as const;

export type ServerConfig = typeof config;
