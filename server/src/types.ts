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

// --- Пресеты и опции с возможностью выбора нескольких + свой параметр ---

/** Пресеты User-Agent (можно выбрать несколько — ротация по запросам). */
export type UserAgentPreset =
  | 'chrome_win'
  | 'chrome_mac'
  | 'chrome_linux'
  | 'firefox_win'
  | 'firefox_mac'
  | 'firefox_linux'
  | 'safari_mac'
  | 'edge_win'
  | 'edge_mac'
  | 'yandex_win'
  | 'opera_win'
  | 'samsung_android'
  | 'random';

/** Опция User-Agent: пресеты (один или несколько для ротации) и/или свой параметр. */
export interface UserAgentOption {
  presets?: UserAgentPreset | UserAgentPreset[];
  custom?: string;
}

/** Пресеты Accept-Language. */
export type AcceptLanguagePreset =
  | 'ru_ru'
  | 'ru_en'
  | 'en_us'
  | 'en_gb'
  | 'de_de'
  | 'tr_tr'
  | 'uk_ua'
  | 'kk_kz'
  | 'be_by'
  | 'en_ru';

export interface AcceptLanguageOption {
  preset?: AcceptLanguagePreset;
  custom?: string;
}

/** Пресеты Referrer-Policy. */
export type ReferrerPolicyPreset =
  | 'no-referrer'
  | 'origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url'
  | 'same-origin';

export interface ReferrerPolicyOption {
  preset?: ReferrerPolicyPreset;
  custom?: string;
}

/** Пресеты размера вьюпорта (ширина×высота). */
export type ViewportPreset =
  | 'desktop_1920'
  | 'desktop_1680'
  | 'desktop_1536'
  | 'desktop_1366'
  | 'laptop_1280'
  | 'laptop_1440'
  | 'tablet_768'
  | 'mobile_414'
  | 'mobile_390'
  | 'mobile_360';

export interface ViewportOption {
  preset?: ViewportPreset;
  custom?: { width: number; height: number };
}

/** Пресеты локали браузера. */
export type LocalePreset = 'ru_RU' | 'en_US' | 'en_GB' | 'de_DE' | 'tr_TR' | 'uk_UA' | 'kk_KZ' | 'be_BY';

export interface LocaleOption {
  preset?: LocalePreset;
  custom?: string;
}

/** Пресеты часового пояса. */
export type TimezonePreset =
  | 'Europe/Moscow'
  | 'Europe/Samara'
  | 'Asia/Yekaterinburg'
  | 'Europe/Kaliningrad'
  | 'Asia/Novosibirsk'
  | 'UTC'
  | 'Europe/London'
  | 'Europe/Minsk'
  | 'Asia/Almaty';

export interface TimezoneOption {
  preset?: TimezonePreset;
  custom?: string;
}

/** Пресеты задержки (мс) между запросами — можно выбрать один или диапазон. */
export type DelayPreset = 'none' | 'low' | 'medium' | 'high' | 'random_medium' | 'random_high';

export interface DelayOption {
  preset?: DelayPreset;
  /** Точное значение (мс) или диапазон. */
  custom?: number | { min: number; max: number };
}

/** Режим прокси: без прокси, список URL вручную, или обход по странам (разные IP по странам). */
export type ProxyMode = 'none' | 'list' | 'by_country';

/** Опция прокси: режим и при list — список URL, при by_country — коды стран (ISO 3166-1 alpha-2). */
export interface ProxyOption {
  mode: ProxyMode;
  /** URL прокси (при mode === 'list'). Один или несколько для ротации. */
  list?: string | string[];
  /** Коды стран для обхода с разных IP (при mode === 'by_country'). Прокси берутся из конфига/env по стране. */
  countries?: string[];
}

/** Настройки захода на сайт: прокси, заголовки, задержки — чтобы снизить вероятность детекта бота. */
export interface AccessOptions {
  /**
   * Прокси: legacy (строка/массив URL) или опция с режимом.
   * - list: ручной список URL (ротация).
   * - by_country: обход с разных IP по выбранным странам (прокси из PROXY_BY_COUNTRY или конфига).
   */
  proxy?: string | string[] | ProxyOption;
  /**
   * User-Agent: пресеты (один или массив для ротации), "random", свой параметр или legacy строка/массив.
   * При указании и presets и custom — в ротацию попадают и те и другие.
   */
  userAgent?: string | 'random' | string[] | UserAgentOption;
  /** Accept-Language: пресет и/или свой заголовок. */
  acceptLanguage?: string | AcceptLanguageOption;
  /** Referrer-Policy: пресет и/или свой параметр. */
  referrerPolicy?: ReferrerPolicyPreset | string | ReferrerPolicyOption;
  /** Дополнительные HTTP-заголовки (можно добавить свои к любому типу). */
  extraHeaders?: Record<string, string>;
  /** Задержка: пресет или свой интервал (мс или { min, max }). */
  delayBetweenRequestsMs?: number | { min: number; max: number } | DelayOption;
  /** Размер окна браузера: пресет и/или свой { width, height }. */
  viewport?: { width: number; height: number } | ViewportOption;
  /** Локаль: пресет и/или своё значение. */
  locale?: string | LocaleOption;
  /** Часовой пояс: пресет и/или своё значение. */
  timezoneId?: string | TimezoneOption;
  /** Включить JavaScript в браузере (по умолчанию true). */
  javaScriptEnabled?: boolean;
  /** Игнорировать ошибки HTTPS (самоподписанные сертификаты). */
  ignoreHTTPSErrors?: boolean;
  /** Скрывать признаки автоматизации в браузере. По умолчанию true. */
  stealth?: boolean;
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
  /** Настройки захода: прокси, User-Agent, заголовки, задержки (анти-бот). */
  access?: AccessOptions;
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
  /** Один стартовый URL (устаревший, используйте seedUrls). */
  seedUrl?: string;
  /** Несколько стартовых URL для обхода (crawl). */
  seedUrls?: string[];
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
  /** Стартовые URL для обхода (crawl). Для обратной совместимости seedUrl = первый из seedUrls. */
  seedUrl: string | null;
  seedUrls: string[];
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
  /** Текущая выполняющаяся проверка (заполняется при старте, очищается при завершении). */
  runningJobId: string | null;
  /** Группа: при задании расписание запускается по интервалу группы. */
  groupId: string | null;
  sortOrder: number;
}
