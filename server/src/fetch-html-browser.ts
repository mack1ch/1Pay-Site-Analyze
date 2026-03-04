import type { Page } from 'playwright';
import { config } from './config.js';

const TIMEOUT_MS = config.playwright.navigationTimeoutMs;

/** Опции загрузки через браузер для максимально полного контента (в т.ч. с бэкенда). */
export interface BrowserFetchOptions {
  timeoutMs?: number;
  /** Таймаут ожидания networkidle (мс). Увеличьте для медленных сайтов. */
  networkIdleTimeoutMs?: number;
  /** Доп. задержка после загрузки (мс), чтобы успел прилететь контент с бэкенда. */
  extraDelayAfterLoadMs?: number;
  /** Ждать стабилизации контента: пока длина текста body не перестанет расти (с таймаутом). */
  waitContentStable?: boolean;
  /** Сколько мс текст должен не меняться, чтобы считать контент стабильным. */
  contentStableSameForMs?: number;
  /** Макс. время ожидания стабилизации контента (мс). */
  contentStableMaxWaitMs?: number;
  /** Прокрутить страницу перед снятием HTML (подгрузка lazy-контента). */
  scrollBeforeCapture?: boolean;
  /** Пауза после прокрутки перед снятием (мс). */
  scrollPauseMs?: number;
}

const DEFAULT_NETWORK_IDLE_MS = 20_000;
const DEFAULT_CONTENT_STABLE_SAME_MS = 2_500;
const DEFAULT_CONTENT_STABLE_MAX_MS = 35_000;
const DEFAULT_SCROLL_PAUSE_MS = 2_000;
const MIN_PHASE_TIMEOUT_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ждёт, пока длина текста body перестанет меняться (контент с бэкенда/JS подгрузился).
 */
async function waitForContentStable(
  page: Page,
  options: {
    sameForMs: number;
    maxWaitMs: number;
    checkIntervalMs: number;
  }
): Promise<void> {
  const { sameForMs, maxWaitMs, checkIntervalMs } = options;
  const start = Date.now();
  let lastLength = -1;
  let lengthStableSince = start;

  while (Date.now() - start < maxWaitMs) {
    const length = await page.evaluate(() => {
      const body = document.body;
      if (!body) return 0;
      return (body.innerText || body.textContent || '').length;
    });

    if (length === lastLength && lastLength >= 0) {
      if (Date.now() - lengthStableSince >= sameForMs) {
        return; // стабильно
      }
    } else {
      lastLength = length;
      lengthStableSince = Date.now();
    }
    await delay(checkIntervalMs);
  }
}

/**
 * Прокручивает страницу вниз и обратно, чтобы триггернуть lazy-load и подгрузку контента.
 */
async function scrollToTriggerLazyContent(
  page: Page,
  pauseAfterScrollMs: number
): Promise<void> {
  await page.evaluate(async (pauseMs) => {
    const body = document.body;
    const doc = document.documentElement;
    const maxScroll = Math.max(
      body?.scrollHeight ?? 0,
      doc?.scrollHeight ?? 0
    );
    const step = Math.max(1, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < maxScroll; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    if (maxScroll > 0) window.scrollTo(0, maxScroll);
    await new Promise((r) => setTimeout(r, pauseMs));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  }, pauseAfterScrollMs);
}

/**
 * Загружает страницу в браузере (Playwright), дожидается отрисовки контента
 * и возвращает полный HTML после выполнения JavaScript.
 * Поддерживает ожидание контента с бэкенда, стабилизацию текста и прокрутку для lazy-load.
 */
export async function fetchHtmlWithBrowser(
  page: Page,
  url: string,
  options?: BrowserFetchOptions
): Promise<{
  ok: boolean;
  html?: string;
  statusCode?: number;
  finalUrl?: string;
  error?: string;
  note?: string;
}> {
  const timeout = options?.timeoutMs ?? TIMEOUT_MS;
  const reserveMs = MIN_PHASE_TIMEOUT_MS;
  const networkIdleTimeout =
    options?.networkIdleTimeoutMs ??
    Math.min(DEFAULT_NETWORK_IDLE_MS, Math.max(reserveMs, timeout - reserveMs));
  const extraDelay = options?.extraDelayAfterLoadMs ?? 0;
  const waitStable = options?.waitContentStable ?? true;
  const stableSameMs = options?.contentStableSameForMs ?? DEFAULT_CONTENT_STABLE_SAME_MS;
  const stableMaxMs =
    options?.contentStableMaxWaitMs ??
    Math.min(DEFAULT_CONTENT_STABLE_MAX_MS, Math.max(reserveMs, timeout - reserveMs));
  const scrollBefore = options?.scrollBeforeCapture ?? true;
  const scrollPause = options?.scrollPauseMs ?? DEFAULT_SCROLL_PAUSE_MS;

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

    // Ожидание networkidle — меньше параллельных запросов, контент успевает подгрузиться
    await page.waitForLoadState('networkidle', { timeout: networkIdleTimeout }).catch(() => {
      // Часть сайтов не переходит в networkidle; продолжаем
    });

    // Ожидание стабилизации контента (подгрузка с бэкенда)
    if (waitStable) {
      await waitForContentStable(page, {
        sameForMs: stableSameMs,
        maxWaitMs: stableMaxMs,
        checkIntervalMs: 500,
      }).catch(() => {});
    }

    // Прокрутка для lazy-load и контента, появляющегося при скролле
    if (scrollBefore) {
      await scrollToTriggerLazyContent(page, scrollPause).catch(() => {});
      // После скролла ещё раз ждём стабилизации (мог подгрузиться контент)
      if (waitStable) {
        await waitForContentStable(page, {
          sameForMs: Math.min(1500, stableSameMs),
          maxWaitMs: 10_000,
          checkIntervalMs: 400,
        }).catch(() => {});
      }
    }

    if (extraDelay > 0) {
      await delay(extraDelay);
    }

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
