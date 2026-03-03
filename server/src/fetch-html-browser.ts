import type { Page } from 'playwright';
import { config } from './config.js';

const TIMEOUT_MS = config.playwright.navigationTimeoutMs;

/**
 * Загружает страницу в браузере (Playwright), дожидается отрисовки контента
 * и возвращает полный HTML после выполнения JavaScript.
 * Используется для сайтов-SPA (plati.market и др.), где контент подгружается через JS
 * и обычный HTTP-запрос возвращает почти пустой документ.
 */
export async function fetchHtmlWithBrowser(
  page: Page,
  url: string,
  options?: { timeoutMs?: number }
): Promise<{
  ok: boolean;
  html?: string;
  statusCode?: number;
  finalUrl?: string;
  error?: string;
  note?: string;
}> {
  const timeout = options?.timeoutMs ?? TIMEOUT_MS;
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    if (!response) {
      return { ok: false, error: 'Нет ответа', note: 'Навигация не вернула ответ' };
    }
    const status = response.status();
    const finalUrl = page.url();

    if (status >= 400) {
      return {
        ok: false,
        statusCode: status,
        finalUrl,
        error: `HTTP ${status}`,
        note: status === 403 ? 'Доступ запрещён' : status === 404 ? 'Страница не найдена' : undefined,
      };
    }

    // Даём SPA время подгрузить контент (запросы, рендер).
    await page.waitForLoadState('networkidle', { timeout: Math.min(15000, timeout) }).catch(() => {
      // Игнорируем: часть сайтов не переходит в networkidle, контент уже может быть в DOM
    });

    const html = await page.content();
    return { ok: true, html, statusCode: status, finalUrl };
  } catch (e) {
    const err = e as Error;
    const isTimeout = err.message?.includes('timeout') || err.name === 'TimeoutError';
    return {
      ok: false,
      error: isTimeout ? 'Таймаут загрузки' : err.message || 'Ошибка загрузки',
      note: isTimeout ? 'Страница не успела загрузиться в отведённое время' : undefined,
    };
  }
}
