import { fetch as undiciFetch, type Response } from 'undici';
import { config } from './config.js';

const TIMEOUT_MS = config.fetch.timeoutMs;
const MAX_BYTES = config.fetch.maxResponseBytes;

export async function fetchHtml(
  url: string,
  signal?: AbortSignal,
  options?: { timeoutMs?: number; maxBytes?: number }
): Promise<{
  ok: boolean;
  html?: string;
  statusCode?: number;
  finalUrl?: string;
  error?: string;
  note?: string;
}> {
  const timeout = options?.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? MAX_BYTES;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
  const abortSignal = controller.signal;

  /** Коды ответа, при которых считаем, что сайт блокирует/ограничивает доступ (бот, лимиты). */
  const BLOCKED_STATUS_CODES = [401, 403, 429, 503];

  try {
    const res = (await undiciFetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'LinkTextExtractor/1.0' },
      signal: abortSignal,
      body: undefined,
    })) as Response & { url?: string };

    clearTimeout(timeoutId);
    const finalUrl = (res as unknown as { url: string }).url ?? url;

    if (BLOCKED_STATUS_CODES.includes(res.status)) {
      const messages: Record<number, string> = {
        401: 'Требуется авторизация (401)',
        403: 'Доступ запрещён — сайт заблокировал запрос (403)',
        429: 'Слишком много запросов — сайт ограничил доступ (429)',
        503: 'Сервис недоступен (503)',
      };
      return {
        ok: false,
        statusCode: res.status,
        finalUrl,
        error: messages[res.status] ?? `Код ответа: ${res.status}`,
        note: 'Сайт, вероятно, обнаружил автоматический доступ. Анализ страницы невозможен.',
      };
    }

    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/html/i.test(ct) && !/application\/xhtml/i.test(ct)) {
      return {
        ok: false,
        statusCode: res.status,
        finalUrl,
        error: 'Не HTML',
        note: 'Тип контента не HTML',
      };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return {
        ok: false,
        statusCode: res.status,
        finalUrl,
        error: 'Ответ слишком большой',
      };
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    return { ok: true, html, statusCode: res.status, finalUrl };
  } catch (e) {
    clearTimeout(timeoutId);
    const err = e as Error;
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'Таймаут' : err.message,
    };
  }
}
