const API_BASE = '/api';

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

export interface JobProgress {
  status: string;
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

export interface JobResponse {
  jobId: string;
  mode: string;
  createdAt: number;
  status: string;
  progress: JobProgress;
  summary?: JobSummary;
}

export interface ResultsResponse {
  items: ResultItem[];
  nextCursor?: string;
}

export interface CrawlOptionsInput {
  crawlMode?: 'submitted_only' | 'seed_only' | 'crawl';
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
  screenshot?: { enabled?: boolean; fullPage?: boolean };
  crawl?: CrawlOptionsInput;
  forbidden?: {
    terms: string[];
    settings: ForbiddenSettings;
  };
  concurrency?: number;
  maxConcurrentScreenshots?: number;
  fetchTimeoutMs?: number;
  playwrightTimeoutMs?: number;
  maxTextChars?: number;
  fullPageScreenshot?: boolean;
  maxPages?: number;
  maxDepth?: number;
  sameHostOnly?: boolean;
  crawlMode?: 'submitted_only' | 'seed_only' | 'crawl';
  allowPattern?: string;
  denyPattern?: string;
  excludeQueryStrings?: boolean;
}

export async function createJob(body: {
  mode: 'list' | 'crawl';
  urls?: string[];
  seedUrl?: string;
  options?: JobOptions;
}): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json();
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error('Job not found');
  return res.json();
}

export async function getResults(
  jobId: string,
  cursor?: number,
  limit?: number
): Promise<ResultsResponse> {
  const params = new URLSearchParams();
  if (cursor != null) params.set('cursor', String(cursor));
  if (limit != null) params.set('limit', String(limit));
  const q = params.toString();
  const res = await fetch(`${API_BASE}/jobs/${jobId}/results${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error('Failed to load results');
  return res.json();
}

export async function cancelJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to cancel');
}

/** История проверок: домен и количество отчётов */
export interface DomainHistoryItem {
  domain: string;
  reportCount: number;
  lastCheckedAt: number;
}

/** Метаданные отчёта из истории */
export interface StoredReportMeta {
  jobId: string;
  createdAt: number;
  mode: string;
  summary: { pagesProcessed?: number; pagesWithViolations?: number } | null;
}

export async function getHistoryDomains(): Promise<{ domains: DomainHistoryItem[] }> {
  const res = await fetch(`${API_BASE}/history/domains`);
  if (!res.ok) throw new Error('Не удалось загрузить историю');
  return res.json();
}

export async function getHistoryReports(domain: string): Promise<{ reports: StoredReportMeta[] }> {
  const res = await fetch(`${API_BASE}/history/domains/${encodeURIComponent(domain)}/reports`);
  if (!res.ok) throw new Error('Не удалось загрузить отчёты');
  return res.json();
}

/** Расписание автоматической проверки */
export interface Schedule {
  id: string;
  name: string;
  mode: 'list' | 'crawl';
  seedUrl: string | null;
  urls: string[];
  cronExpression: string;
  timezone: string;
  endAt: number | null;
  options: Record<string, unknown>;
  forbiddenTerms: string[];
  forbiddenSettings: Record<string, unknown>;
  telegramChatId: string | null;
  telegramBotToken: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  lastJobId: string | null;
  nextRunAt: number | null;
}

export interface ScheduleCreate {
  name?: string;
  mode: 'list' | 'crawl';
  seedUrl?: string | null;
  urls?: string[];
  cronExpression: string;
  timezone?: string;
  endAt?: number | null;
  options?: Record<string, unknown>;
  forbiddenTerms?: string[];
  forbiddenSettings?: Record<string, unknown>;
  telegramChatId?: string | null;
  telegramBotToken?: string | null;
  enabled?: boolean;
}

export async function getSchedules(): Promise<{ schedules: Schedule[] }> {
  const res = await fetch(`${API_BASE}/schedules`);
  if (!res.ok) throw new Error('Не удалось загрузить расписания');
  return res.json();
}

export async function getSchedule(id: string): Promise<Schedule> {
  const res = await fetch(`${API_BASE}/schedules/${id}`);
  if (!res.ok) throw new Error('Расписание не найдено');
  return res.json();
}

export async function createSchedule(body: ScheduleCreate): Promise<Schedule> {
  const res = await fetch(`${API_BASE}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json();
}

export async function updateSchedule(id: string, body: Partial<ScheduleCreate>): Promise<Schedule> {
  const res = await fetch(`${API_BASE}/schedules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json();
}

export async function deleteSchedule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Не удалось удалить');
}

export function screenshotFullUrl(screenshotUrl: string): string {
  if (screenshotUrl.startsWith('http')) return screenshotUrl;
  const base = window.location.origin;
  return base + screenshotUrl;
}

/** Data URL placeholder when screenshot image fails to load */
export const SCREENSHOT_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f5f5f5"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999" font-family="sans-serif" font-size="14">Скриншот недоступен</text></svg>'
  );
