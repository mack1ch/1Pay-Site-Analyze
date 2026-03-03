import type {
  AccessOptions,
  UserAgentPreset,
  AcceptLanguagePreset,
  ReferrerPolicyPreset,
  ViewportPreset,
  LocalePreset,
  TimezonePreset,
  DelayPreset,
  UserAgentOption,
  AcceptLanguageOption,
  ReferrerPolicyOption,
  ViewportOption,
  LocaleOption,
  TimezoneOption,
  DelayOption,
  ProxyOption,
} from './types.js';

// --- Карты пресетов (можно использовать для UI и для разрешения) ---

/** Пресеты User-Agent: неочевидные и распространённые варианты. */
export const USER_AGENT_PRESETS: Record<Exclude<UserAgentPreset, 'random'>, string> = {
  chrome_win:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chrome_mac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chrome_linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  firefox_win:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  firefox_mac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  firefox_linux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  safari_mac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  edge_win:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  edge_mac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  yandex_win:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0.0 Safari/537.36',
  opera_win:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/105.0.0.0',
  samsung_android:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
};

/** Все UA для ротации "random". */
const RANDOM_USER_AGENTS = Object.values(USER_AGENT_PRESETS);

export const ACCEPT_LANGUAGE_PRESETS: Record<AcceptLanguagePreset, string> = {
  ru_ru: 'ru-RU,ru;q=0.9,en;q=0.8',
  ru_en: 'ru-RU,en-US;q=0.9,ru;q=0.8',
  en_us: 'en-US,en;q=0.9',
  en_gb: 'en-GB,en;q=0.9',
  de_de: 'de-DE,de;q=0.9,en;q=0.8',
  tr_tr: 'tr-TR,tr;q=0.9,en;q=0.8',
  uk_ua: 'uk-UA,uk;q=0.9,ru;q=0.8',
  kk_kz: 'kk-KZ,kk;q=0.9,ru;q=0.8',
  be_by: 'be-BY,be;q=0.9,ru;q=0.8',
  en_ru: 'en-US,ru;q=0.9,en;q=0.8',
};

export const REFERRER_POLICY_PRESETS: Record<ReferrerPolicyPreset, string> = {
  'no-referrer': 'no-referrer',
  origin: 'origin',
  'strict-origin': 'strict-origin',
  'strict-origin-when-cross-origin': 'strict-origin-when-cross-origin',
  'unsafe-url': 'unsafe-url',
  'same-origin': 'same-origin',
};

export const VIEWPORT_PRESETS: Record<ViewportPreset, { width: number; height: number }> = {
  desktop_1920: { width: 1920, height: 1080 },
  desktop_1680: { width: 1680, height: 1050 },
  desktop_1536: { width: 1536, height: 864 },
  desktop_1366: { width: 1366, height: 768 },
  laptop_1280: { width: 1280, height: 720 },
  laptop_1440: { width: 1440, height: 900 },
  tablet_768: { width: 768, height: 1024 },
  mobile_414: { width: 414, height: 896 },
  mobile_390: { width: 390, height: 844 },
  mobile_360: { width: 360, height: 800 },
};

export const LOCALE_PRESETS: Record<LocalePreset, string> = {
  ru_RU: 'ru-RU',
  en_US: 'en-US',
  en_GB: 'en-GB',
  de_DE: 'de-DE',
  tr_TR: 'tr-TR',
  uk_UA: 'uk-UA',
  kk_KZ: 'kk-KZ',
  be_BY: 'be-BY',
};

export const TIMEZONE_PRESETS: Record<TimezonePreset, string> = {
  'Europe/Moscow': 'Europe/Moscow',
  'Europe/Samara': 'Europe/Samara',
  'Asia/Yekaterinburg': 'Asia/Yekaterinburg',
  'Europe/Kaliningrad': 'Europe/Kaliningrad',
  'Asia/Novosibirsk': 'Asia/Novosibirsk',
  UTC: 'UTC',
  'Europe/London': 'Europe/London',
  'Europe/Minsk': 'Europe/Minsk',
  'Asia/Almaty': 'Asia/Almaty',
};

/** Пресеты задержки: значение в мс или диапазон. */
export const DELAY_PRESETS: Record<DelayPreset, number | { min: number; max: number }> = {
  none: 0,
  low: 300,
  medium: 1500,
  high: 4000,
  random_medium: { min: 800, max: 2500 },
  random_high: { min: 2000, max: 6000 },
};

function ensureArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Прокси по странам: из env PROXY_BY_COUNTRY (JSON {"RU":"http://...", "DE":"http://..."}) или пустой объект. */
function getProxyByCountryConfig(): Record<string, string | string[]> {
  try {
    const raw = process.env.PROXY_BY_COUNTRY;
    if (!raw?.trim()) return {};
    const parsed = JSON.parse(raw) as Record<string, string | string[]>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore
  }
  return {};
}

/** Возвращает список URL прокси для ротации: из legacy, ProxyOption.list или ProxyOption.by_country. */
function getProxyList(access: AccessOptions | undefined): string[] {
  const raw = access?.proxy;
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const s = raw.trim();
    return /^https?:\/\//i.test(s) || /^socks/i.test(s) ? [s] : [];
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((u): u is string => typeof u === 'string')
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u) || /^socks/i.test(u));
  }
  const opt = raw as ProxyOption;
  if (opt.mode === 'none') return [];
  if (opt.mode === 'list' && opt.list != null) {
    const list = ensureArray(opt.list).filter((u): u is string => typeof u === 'string');
    return list.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u) || /^socks/i.test(u));
  }
  if (opt.mode === 'by_country' && opt.countries?.length) {
    const byCountry = getProxyByCountryConfig();
    const out: string[] = [];
    for (const code of opt.countries) {
      const key = String(code).toUpperCase().trim();
      const urls = byCountry[key];
      if (urls == null) continue;
      if (typeof urls === 'string') out.push(urls.trim());
      else if (Array.isArray(urls)) out.push(...urls.filter((u) => typeof u === 'string').map((u) => u.trim()));
    }
    return out.filter((u) => /^https?:\/\//i.test(u) || /^socks/i.test(u));
  }
  return [];
}

function resolveUserAgentOption(opt: UserAgentOption, requestIndex: number): string[] {
  const list: string[] = [];
  const presets = ensureArray(opt.presets).filter(
    (p): p is UserAgentPreset => typeof p === 'string' && (p === 'random' || p in USER_AGENT_PRESETS)
  );
  for (const p of presets) {
    if (p === 'random') {
      list.push(...RANDOM_USER_AGENTS);
    } else if (USER_AGENT_PRESETS[p]) {
      list.push(USER_AGENT_PRESETS[p]);
    }
  }
  if (opt.custom?.trim()) list.push(opt.custom.trim());
  return list;
}

/** Нормализует userAgent из AccessOptions в массив строк для ротации. */
function getUserAgentList(access: AccessOptions | undefined): string[] {
  const ua = access?.userAgent;
  if (ua == null) return RANDOM_USER_AGENTS;
  if (typeof ua === 'string') {
    if (ua === 'random') return RANDOM_USER_AGENTS;
    return [ua];
  }
  if (Array.isArray(ua)) return ua.filter((s) => typeof s === 'string');
  if (typeof ua === 'object' && ('presets' in ua || 'custom' in ua)) {
    const list = resolveUserAgentOption(ua as UserAgentOption, 0);
    return list.length ? list : RANDOM_USER_AGENTS;
  }
  return RANDOM_USER_AGENTS;
}

/** Возвращает прокси для запроса: один из списка по индексу (ротация) или единственный. */
export function resolveProxy(access: AccessOptions | undefined, requestIndex: number): string | undefined {
  const list = getProxyList(access);
  if (!list.length) return undefined;
  const raw = list[requestIndex % list.length];
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s || undefined;
}

/** Возвращает User-Agent для запроса: из пресетов/списка/random с ротацией. */
export function resolveUserAgent(access: AccessOptions | undefined, requestIndex: number): string {
  const list = getUserAgentList(access);
  if (!list.length) return RANDOM_USER_AGENTS[0];
  return list[requestIndex % list.length];
}

function resolveAcceptLanguage(access: AccessOptions | undefined): string {
  const raw = access?.acceptLanguage;
  const defaultVal = 'ru-RU,ru;q=0.9,en;q=0.8';
  if (raw == null) return defaultVal;
  if (typeof raw === 'string') return raw.trim() || defaultVal;
  const opt = raw as AcceptLanguageOption;
  if (opt.custom?.trim()) return opt.custom.trim();
  if (opt.preset && ACCEPT_LANGUAGE_PRESETS[opt.preset]) return ACCEPT_LANGUAGE_PRESETS[opt.preset];
  return defaultVal;
}

function resolveReferrerPolicy(access: AccessOptions | undefined): string | undefined {
  const raw = access?.referrerPolicy;
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw.trim() || undefined;
  const opt = raw as ReferrerPolicyOption;
  if (opt.custom?.trim()) return opt.custom.trim();
  if (opt.preset && REFERRER_POLICY_PRESETS[opt.preset]) return REFERRER_POLICY_PRESETS[opt.preset];
  return undefined;
}

/** Разрешает viewport: пресет или custom, иначе null (использовать из config). */
export function resolveViewport(
  access: AccessOptions | undefined
): { width: number; height: number } | null {
  const raw = access?.viewport;
  if (raw == null) return null;
  if (typeof raw === 'object' && 'width' in raw && 'height' in raw && !('preset' in raw)) {
    const w = Number((raw as { width: number; height: number }).width);
    const h = Number((raw as { width: number; height: number }).height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
    return null;
  }
  const opt = raw as ViewportOption;
  if (opt.custom?.width != null && opt.custom?.height != null) {
    const w = Number(opt.custom.width);
    const h = Number(opt.custom.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
  }
  if (opt.preset && VIEWPORT_PRESETS[opt.preset]) return VIEWPORT_PRESETS[opt.preset];
  return null;
}

function resolveLocale(access: AccessOptions | undefined): string | undefined {
  const raw = access?.locale;
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw.trim() || undefined;
  const opt = raw as LocaleOption;
  if (opt.custom?.trim()) return opt.custom.trim();
  if (opt.preset && LOCALE_PRESETS[opt.preset]) return LOCALE_PRESETS[opt.preset];
  return undefined;
}

function resolveTimezoneId(access: AccessOptions | undefined): string | undefined {
  const raw = access?.timezoneId;
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw.trim() || undefined;
  const opt = raw as TimezoneOption;
  if (opt.custom?.trim()) return opt.custom.trim();
  if (opt.preset && TIMEZONE_PRESETS[opt.preset]) return TIMEZONE_PRESETS[opt.preset];
  return undefined;
}

/** Разрешает значение задержки в мс (одно число или случайное в диапазоне). */
function resolveDelayMs(access: AccessOptions | undefined): number {
  const raw = access?.delayBetweenRequestsMs;
  if (raw == null) return 0;
  if (typeof raw === 'number') return Math.max(0, raw);
  if (typeof raw === 'object' && 'min' in raw && 'max' in raw) {
    const min = Math.max(0, (raw as { min: number; max: number }).min ?? 0);
    const max = Math.max(min, (raw as { min: number; max: number }).max ?? min);
    return min === max ? min : min + Math.floor(Math.random() * (max - min + 1));
  }
  const opt = raw as DelayOption;
  if (opt.custom != null) {
    if (typeof opt.custom === 'number') return Math.max(0, opt.custom);
    const min = Math.max(0, opt.custom.min ?? 0);
    const max = Math.max(min, opt.custom.max ?? min);
    return min === max ? min : min + Math.floor(Math.random() * (max - min + 1));
  }
  if (opt.preset != null && DELAY_PRESETS[opt.preset] != null) {
    const d = DELAY_PRESETS[opt.preset];
    return typeof d === 'number' ? d : d.min + Math.floor(Math.random() * (d.max - d.min + 1));
  }
  return 0;
}

/** Собирает заголовки для HTTP-запроса (fetch): UA, Accept-Language, Sec-Fetch-*, Referrer-Policy. */
export function buildFetchHeaders(
  access: AccessOptions | undefined,
  requestIndex: number
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': resolveUserAgent(access, requestIndex),
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': resolveAcceptLanguage(access),
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
  const ref = resolveReferrerPolicy(access);
  if (ref) headers['Referrer-Policy'] = ref;
  if (access?.extraHeaders && typeof access.extraHeaders === 'object') {
    for (const [k, v] of Object.entries(access.extraHeaders)) {
      if (k && typeof v === 'string') headers[k] = v;
    }
  }
  return headers;
}

/** Возвращает задержку в мс перед следующим запросом. */
export function getDelayMs(access: AccessOptions | undefined): number {
  return resolveDelayMs(access);
}

/** Задержка перед запросом (Promise). */
export function delayBeforeRequest(access: AccessOptions | undefined): Promise<void> {
  const ms = getDelayMs(access);
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/** Возвращает разрешённые значения для использования в браузере (Playwright). */
export function getResolvedAccessForBrowser(access: AccessOptions | undefined) {
  return {
    acceptLanguage: resolveAcceptLanguage(access),
    referrerPolicy: resolveReferrerPolicy(access),
    viewport: resolveViewport(access),
    locale: resolveLocale(access),
    timezoneId: resolveTimezoneId(access),
  };
}
