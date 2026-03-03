export type JobMode = 'list' | 'crawl';
export type CrawlMode = 'submitted_only' | 'seed_only' | 'crawl';

export type ForbiddenMatchMode =
  | 'exact_substring'
  | 'word'
  | 'smart_stem'
  | 'smart_fuzzy';
export type ForbiddenLanguageMode = 'auto' | 'ru' | 'en';
export type ForbiddenPhraseMode = 'disabled' | 'token_stem_sequence';

export interface ForbiddenFuzzySettings {
  enabled: boolean;
  maxDistance?: number;
  maxTokensChecked?: number;
}

export interface ForbiddenSettings {
  matchMode?: ForbiddenMatchMode;
  languageMode?: ForbiddenLanguageMode;
  phraseMode?: ForbiddenPhraseMode;
  caseSensitive?: boolean;
  minWordLength?: number;
  maxMatchesPerTermPerPage?: number;
  fuzzy?: ForbiddenFuzzySettings;
}

export interface ForbiddenOptions {
  terms: string[];
  settings: ForbiddenSettings;
}

export interface CrawlOptionsInput {
  crawlMode?: CrawlMode;
  maxPages?: number;
  maxDepth?: number;
  sameHostOnly?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface JobOptions {
  concurrencyFetch?: number;
  concurrencyScreenshots?: number;
  maxChars?: number;
  maxResponseBytes?: number;
  /** Загружать страницы через браузер (Playwright) для сайтов с JS-контентом (SPA). */
  useBrowserFetch?: boolean;
  screenshot?: { enabled?: boolean; fullPage?: boolean };
  crawl?: CrawlOptionsInput;
  forbidden?: ForbiddenOptions;
  // legacy / shortcuts
  concurrency?: number;
  maxConcurrentScreenshots?: number;
  fetchTimeoutMs?: number;
  playwrightTimeoutMs?: number;
  maxTextChars?: number;
  fullPageScreenshot?: boolean;
  maxPages?: number;
  maxDepth?: number;
  sameHostOnly?: boolean;
  crawlMode?: CrawlMode;
  allowPattern?: string;
  denyPattern?: string;
  excludeQueryStrings?: boolean;
}

export interface JobCreateBody {
  mode: JobMode;
  urls?: string[];
  seedUrl?: string;
  options?: JobOptions;
}

export interface MatchedTerm {
  term: string;
  count: number;
  matchType: ForbiddenMatchMode | 'phrase';
  normalizedTerm?: string;
  snippets?: Array<{ snippet: string }>;
}

export interface ForbiddenScanResult {
  hasMatches: boolean;
  totalMatches: number;
  matchedTerms: MatchedTerm[];
}

export interface ResultItem {
  url: string;
  finalUrl?: string;
  ok: boolean;
  statusCode?: number;
  title?: string;
  text?: string;
  textLength?: number;
  truncated?: boolean;
  screenshotUrl?: string;
  /** Дата выдачи SSL-сертификата (YYYY-MM-DD), только для HTTPS. */
  sslValidFrom?: string;
  /** Дата истечения SSL-сертификата (YYYY-MM-DD). */
  sslValidTo?: string;
  /** true, если сайт вернул 403/401/429/503 — доступ заблокирован или ограничен. */
  blockedBySite?: boolean;
  note?: string;
  error?: string;
  forbiddenScan?: ForbiddenScanResult;
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'cancelled'
  | 'failed'
  | 'pending'
  | 'completed';

export interface JobProgress {
  status: JobStatus;
  discovered?: number;
  queued?: number;
  processed: number;
  failed: number;
  violations?: number;
  total?: number;
}

export interface JobSummary {
  pagesProcessed?: number;
  pagesWithViolations?: number;
  topTerms?: Array<{ term: string; count: number }>;
}

export interface JobRecord {
  jobId: string;
  mode: JobMode;
  createdAt: number;
  progress: JobProgress;
  summary?: JobSummary;
  results: ResultItem[];
  cancelled?: boolean;
  /** Если задание запущено по расписанию. */
  scheduleId?: string;
}

export interface ScheduleRecord {
  id: string;
  name: string;
  mode: JobMode;
  seedUrl: string | null;
  urls: string[];
  cronExpression: string;
  timezone: string;
  endAt: number | null;
  options: JobOptions;
  forbiddenTerms: string[];
  forbiddenSettings: ForbiddenSettings;
  telegramChatId: string | null;
  telegramBotToken: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  lastJobId: string | null;
}
