import type { FastifyInstance } from 'fastify';
import {
  USER_AGENT_PRESETS,
  ACCEPT_LANGUAGE_PRESETS,
  REFERRER_POLICY_PRESETS,
  VIEWPORT_PRESETS,
  LOCALE_PRESETS,
  TIMEZONE_PRESETS,
  DELAY_PRESETS,
} from '../access-profile.js';

/** Человекочитаемые подписи для пресетов (можно расширять). */
const USER_AGENT_LABELS: Record<string, string> = {
  chrome_win: 'Chrome (Windows)',
  chrome_mac: 'Chrome (macOS)',
  chrome_linux: 'Chrome (Linux)',
  firefox_win: 'Firefox (Windows)',
  firefox_mac: 'Firefox (macOS)',
  firefox_linux: 'Firefox (Linux)',
  safari_mac: 'Safari (macOS)',
  edge_win: 'Edge (Windows)',
  edge_mac: 'Edge (macOS)',
  yandex_win: 'Яндекс (Windows)',
  opera_win: 'Opera (Windows)',
  samsung_android: 'Samsung Internet (Android)',
  random: 'Случайный (ротация)',
};

const ACCEPT_LANGUAGE_LABELS: Record<string, string> = {
  ru_ru: 'Русский (RU)',
  ru_en: 'Русский + English',
  en_us: 'English (US)',
  en_gb: 'English (GB)',
  de_de: 'Deutsch',
  tr_tr: 'Türkçe',
  uk_ua: 'Українська',
  kk_kz: 'Қазақша',
  be_by: 'Беларуская',
  en_ru: 'English + Русский',
};

const REFERRER_POLICY_LABELS: Record<string, string> = {
  'no-referrer': 'no-referrer',
  origin: 'origin',
  'strict-origin': 'strict-origin',
  'strict-origin-when-cross-origin': 'strict-origin-when-cross-origin',
  'unsafe-url': 'unsafe-url',
  'same-origin': 'same-origin',
};

const VIEWPORT_LABELS: Record<string, string> = {
  desktop_1920: '1920×1080',
  desktop_1680: '1680×1050',
  desktop_1536: '1536×864',
  desktop_1366: '1366×768',
  laptop_1280: '1280×720',
  laptop_1440: '1440×900',
  tablet_768: '768×1024',
  mobile_414: '414×896',
  mobile_390: '390×844',
  mobile_360: '360×800',
};

const DELAY_LABELS: Record<string, string> = {
  none: 'Без задержки',
  low: 'Низкая (~300 мс)',
  medium: 'Средняя (~1.5 с)',
  high: 'Высокая (~4 с)',
  random_medium: 'Случайно 0.8–2.5 с',
  random_high: 'Случайно 2–6 с',
};

function toOptions<T>(map: Record<string, T>, labels: Record<string, string>) {
  return Object.keys(map).map((value) => ({
    value,
    label: labels[value] ?? value,
  }));
}

export default async function presetsRoutes(app: FastifyInstance) {
  app.get('/api/access-presets', async (_request, reply) => {
    return reply.send({
      userAgent: toOptions({ ...USER_AGENT_PRESETS, random: 'random' }, USER_AGENT_LABELS),
      acceptLanguage: toOptions(ACCEPT_LANGUAGE_PRESETS, ACCEPT_LANGUAGE_LABELS),
      referrerPolicy: toOptions(REFERRER_POLICY_PRESETS, REFERRER_POLICY_LABELS),
      viewport: toOptions(
        VIEWPORT_PRESETS,
        VIEWPORT_LABELS
      ),
      locale: toOptions(LOCALE_PRESETS, Object.fromEntries(
        Object.keys(LOCALE_PRESETS).map((k) => [k, k.replace('_', '-')])
      )),
      timezone: toOptions(TIMEZONE_PRESETS, Object.fromEntries(
        Object.keys(TIMEZONE_PRESETS).map((k) => [k, k])
      )),
      delay: toOptions(DELAY_PRESETS, DELAY_LABELS),
    });
  });
}
