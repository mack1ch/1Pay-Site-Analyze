import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Browser, Page } from 'playwright';
import sharp from 'sharp';
import { config } from './config.js';
import type { AccessOptions } from './types.js';
import {
  resolveProxy,
  resolveUserAgent,
  resolveViewport,
  getResolvedAccessForBrowser,
} from './access-profile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '..', 'storage', 'screenshots');

const SCROLL_SETTLE_MS = 80;

export function screenshotPathForUrl(finalUrl: string): { filename: string; filePath: string } {
  const hash = createHash('sha256').update(finalUrl).digest('hex').slice(0, 16);
  const filename = `${hash}.png`;
  return { filename, filePath: path.join(STORAGE_DIR, filename) };
}

/**
 * Получает высоту прокручиваемого документа (scrollHeight).
 */
async function getDocumentScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      html?.clientHeight ?? 0,
      html?.scrollHeight ?? 0,
      html?.offsetHeight ?? 0
    );
  });
}

/** Координаты прямоугольника в пространстве документа (для подсветки на скриншоте). */
export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Ищет в DOM все вхождения переданных терминов и возвращает их bounding rect в координатах документа.
 */
async function getHighlightRects(page: Page, terms: string[]): Promise<HighlightRect[]> {
  if (!terms.length) return [];
  const rects = await page.evaluate((searchTerms: string[]) => {
    const result: Array<{ top: number; left: number; width: number; height: number }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || '';
      for (const term of searchTerms) {
        if (!term || term.length > 500) continue;
        const lower = text.toLowerCase();
        const termLower = term.toLowerCase();
        let idx = lower.indexOf(termLower);
        while (idx !== -1) {
          try {
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, Math.min(idx + term.length, text.length));
            const r = range.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              result.push({
                top: r.top + window.scrollY,
                left: r.left + window.scrollX,
                width: r.width,
                height: r.height,
              });
            }
          } catch {
            // ignore invalid range
          }
          idx = lower.indexOf(termLower, idx + 1);
        }
      }
    }
    return result;
  }, terms);
  return rects;
}

const HIGHLIGHT_PADDING = 2;
const HIGHLIGHT_ALPHA = 0.4;
/** Толщина красной обводки (пиксели) для чёткой видимости аномалий. */
const HIGHLIGHT_BORDER_PX = 2;

/**
 * Рисует красные прямоугольники поверх изображения: полупрозрачная заливка + чёткая красная обводка (подсветка нарушений).
 */
async function drawHighlightsOnImage(
  imagePath: string,
  rects: HighlightRect[],
  imageWidth: number,
  imageHeight: number
): Promise<void> {
  if (!rects.length) return;
  const image = sharp(imagePath);
  const meta = await image.metadata();
  const w = meta.width ?? imageWidth;
  const h = meta.height ?? imageHeight;

  const overlays: Array<{ input: Buffer; top: number; left: number }> = [];
  for (const r of rects) {
    let top = Math.max(0, Math.floor(r.top - HIGHLIGHT_PADDING));
    let left = Math.max(0, Math.floor(r.left - HIGHLIGHT_PADDING));
    let width = Math.ceil(r.width + HIGHLIGHT_PADDING * 2);
    let height = Math.ceil(r.height + HIGHLIGHT_PADDING * 2);
    if (left + width > w) width = w - left;
    if (top + height > h) height = h - top;
    if (width <= 0 || height <= 0) continue;

    const overlay = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 60, b: 60, alpha: HIGHLIGHT_ALPHA },
      },
    })
      .png()
      .toBuffer();
    overlays.push({ input: overlay, top, left });

    if (HIGHLIGHT_BORDER_PX > 0 && width > HIGHLIGHT_BORDER_PX * 2 && height > HIGHLIGHT_BORDER_PX * 2) {
      const borderColor = { r: 255, g: 0, b: 0, alpha: 1 };
      const topLine = await sharp({
        create: {
          width,
          height: HIGHLIGHT_BORDER_PX,
          channels: 4,
          background: borderColor,
        },
      })
        .png()
        .toBuffer();
      const bottomLine = topLine;
      const sideHeight = height - HIGHLIGHT_BORDER_PX * 2;
      const leftLine = await sharp({
        create: {
          width: HIGHLIGHT_BORDER_PX,
          height: sideHeight > 0 ? sideHeight : 1,
          channels: 4,
          background: borderColor,
        },
      })
        .png()
        .toBuffer();
      const rightLine = leftLine;
      overlays.push({ input: topLine, top, left });
      overlays.push({ input: bottomLine, top: top + height - HIGHLIGHT_BORDER_PX, left });
      overlays.push({ input: leftLine, top: top + HIGHLIGHT_BORDER_PX, left });
      overlays.push({ input: rightLine, top: top + HIGHLIGHT_BORDER_PX, left: left + width - HIGHLIGHT_BORDER_PX });
    }
  }

  const tmpPath = path.join(path.dirname(imagePath), '_tmp_' + path.basename(imagePath));
  await image
    .composite(overlays)
    .png()
    .toFile(tmpPath);
  fs.renameSync(tmpPath, imagePath);
}

/**
 * Делает полностраничный скриншот через скролл: снимает по высоте вьюпорта без перекрытия и склеивает в одно изображение.
 */
async function takeFullPageScreenshotByScroll(
  page: Page,
  filePath: string,
  viewportWidth: number,
  viewportHeight: number,
  scrollHeight: number
): Promise<void> {
  const chunks: Buffer[] = [];
  let y = 0;

  while (y < scrollHeight) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS));

    const chunkHeight = Math.min(viewportHeight, scrollHeight - y);
    const buffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: viewportWidth, height: chunkHeight },
    });
    chunks.push(Buffer.from(buffer));
    y += viewportHeight;
  }

  const base = sharp({
    create: {
      width: viewportWidth,
      height: scrollHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const composites = chunks.map((buffer, i) => ({
    input: buffer,
    top: i * viewportHeight,
    left: 0,
  }));

  await base.composite(composites).png().toFile(filePath);
}

export interface TakeScreenshotOptions {
  fullPage?: boolean;
  /** Термины, найденные как нарушения — на скриншоте будут подсвечены красным. */
  highlightTerms?: Array<{ term: string }>;
}

export interface TakeScreenshotOptionsWithViewport extends TakeScreenshotOptions {
  /** Размер вьюпорта (если задан в access при создании пула). */
  viewport?: { width: number; height: number };
}

export async function takeScreenshot(
  page: Page,
  finalUrl: string,
  options?: TakeScreenshotOptionsWithViewport
): Promise<{ filePath: string; filename: string } | { error: string }> {
  const { filePath, filename } = screenshotPathForUrl(finalUrl);
  const fullPage = options?.fullPage ?? config.playwright.fullPageScreenshot;
  const highlightTerms = options?.highlightTerms ?? [];
  const viewport = options?.viewport ?? config.playwright.viewport;
  const { width: viewportWidth, height: viewportHeight } = viewport;

  try {
    await page.goto(finalUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.playwright.navigationTimeoutMs,
    });

    let highlightRects: HighlightRect[] = [];
    if (highlightTerms.length > 0) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 50));
      const terms = highlightTerms.map((t) => t.term).filter(Boolean);
      highlightRects = await getHighlightRects(page, terms);
    }

    let imageHeight: number = viewportHeight;
    if (fullPage) {
      const scrollHeight = await getDocumentScrollHeight(page);
      imageHeight = scrollHeight;
      if (scrollHeight <= viewportHeight) {
        await page.screenshot({ path: filePath });
      } else {
        await takeFullPageScreenshotByScroll(
          page,
          filePath,
          viewportWidth,
          viewportHeight,
          scrollHeight
        );
      }
    } else {
      await page.screenshot({ path: filePath });
    }

    if (highlightRects.length > 0) {
      try {
        await drawHighlightsOnImage(filePath, highlightRects, viewportWidth, imageHeight);
      } catch (e) {
        console.warn('[screenshot] highlight draw failed, saving without highlights:', (e as Error).message);
      }
    }

    return { filePath, filename };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface PlaywrightPool {
  browser: Browser;
  acquirePage(): Promise<Page>;
  releasePage(page: Page): Promise<void>;
  close(): Promise<void>;
  /** Текущий viewport (из access или config) для передачи в takeScreenshot. */
  viewport: { width: number; height: number };
}

function parseProxyForPlaywright(proxyUrl: string): { server: string; username?: string; password?: string } {
  try {
    const u = new URL(proxyUrl);
    const server = `${u.protocol}//${u.host}`;
    return {
      server,
      username: u.username || undefined,
      password: u.password || undefined,
    };
  } catch {
    return { server: proxyUrl };
  }
}

/** Аргументы Chromium, снижающие детект автоматизации (нет AutomationControlled, инфобаров). */
const STEALTH_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--disable-infobars',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-sync',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
];

/**
 * Скрипт, выполняемый до загрузки страницы: маскирует navigator.webdriver и типичные переменные автоматизации.
 * Передаётся в context.addInitScript().
 */
const STEALTH_INIT_SCRIPT = () => {
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // ignore if not configurable
  }
  try {
    const w = window as unknown as { chrome?: unknown };
    if (!w.chrome) {
      w.chrome = { runtime: {} };
    }
  } catch {
    // ignore
  }
  const origQuery = window.navigator.permissions?.query?.bind(navigator.permissions);
  if (typeof origQuery === 'function') {
    (navigator.permissions as { query: (p: PermissionDescriptor) => Promise<PermissionStatus> }).query = (
      params: PermissionDescriptor
    ) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: 'prompt', onchange: null } as PermissionStatus)
        : origQuery(params);
  }
};

export async function createPlaywrightPool(
  maxPages: number,
  access?: AccessOptions
): Promise<PlaywrightPool> {
  const { chromium } = await import('playwright');
  const useStealth = access?.stealth !== false;
  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: useStealth ? STEALTH_LAUNCH_ARGS : ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (process.env.USE_REAL_CHROME === '1') {
    launchOptions.channel = 'chrome';
  }
  const browser = await chromium.launch(launchOptions);

  const resolvedBrowser = getResolvedAccessForBrowser(access);
  const viewport = resolveViewport(access) ?? config.playwright.viewport;
  let contextIndex = 0;

  const available: Page[] = [];
  const inUse = new Set<Page>();

  async function acquirePage(): Promise<Page> {
    let page = available.pop();
    if (!page || page.isClosed()) {
      const idx = contextIndex++;
      const proxyUrl = resolveProxy(access, idx);
      const proxy = proxyUrl ? parseProxyForPlaywright(proxyUrl) : undefined;
      const userAgent = resolveUserAgent(access, idx);
      const extraHeaders: Record<string, string> = {};
      if (resolvedBrowser.acceptLanguage) extraHeaders['Accept-Language'] = resolvedBrowser.acceptLanguage;
      if (resolvedBrowser.referrerPolicy) extraHeaders['Referrer-Policy'] = resolvedBrowser.referrerPolicy;
      if (access?.extraHeaders && typeof access.extraHeaders === 'object') {
        Object.assign(extraHeaders, access.extraHeaders);
      }
      const ctx = await browser.newContext({
        viewport,
        ignoreHTTPSErrors: access?.ignoreHTTPSErrors ?? true,
        userAgent,
        locale: resolvedBrowser.locale,
        timezoneId: resolvedBrowser.timezoneId,
        javaScriptEnabled: access?.javaScriptEnabled ?? true,
        proxy,
        extraHTTPHeaders: Object.keys(extraHeaders).length ? extraHeaders : undefined,
      });
      if (useStealth) {
        await ctx.addInitScript(STEALTH_INIT_SCRIPT);
      }
      page = await ctx.newPage();
    }
    inUse.add(page);
    return page;
  }

  async function releasePage(page: Page): Promise<void> {
    inUse.delete(page);
    try {
      await page.goto('about:blank');
    } catch {
      // ignore
    }
    if (!page.isClosed()) {
      available.push(page);
    }
  }

  return {
    browser,
    acquirePage,
    releasePage,
    viewport,
    async close() {
      await browser.close();
    },
  };
}
