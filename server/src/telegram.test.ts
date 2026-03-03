import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTelegramAlert } from './telegram.js';
import type { JobRecord } from './types.js';

describe('sendTelegramAlert', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it('returns false when bot token or chat id missing', async () => {
    const job: JobRecord = {
      jobId: 'test-id',
      mode: 'crawl',
      createdAt: Date.now(),
      progress: { status: 'done', processed: 1, failed: 0 },
      results: [
        {
          url: 'https://example.com/page',
          finalUrl: 'https://example.com/page',
          ok: true,
          forbiddenScan: { hasMatches: true, totalMatches: 1, matchedTerms: [{ term: 'слово', count: 1, matchType: 'word' }] },
        },
      ],
    };
    expect(await sendTelegramAlert(job, {})).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends message with violations and report link when token and chat provided', async () => {
    const job: JobRecord = {
      jobId: 'job-123',
      mode: 'crawl',
      createdAt: Date.now(),
      progress: { status: 'done', processed: 1, failed: 0, violations: 1 },
      results: [
        {
          url: 'https://example.com/page',
          finalUrl: 'https://example.com/page',
          ok: true,
          forbiddenScan: {
            hasMatches: true,
            totalMatches: 1,
            matchedTerms: [{ term: 'запрещённое', count: 1, matchType: 'word' }],
          },
        },
      ],
    };
    const result = await sendTelegramAlert(job, {
      botToken: 'test-token',
      chatId: '123',
      baseUrl: 'https://app.example.com',
    });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottest-token/sendMessage');
    const body = JSON.parse(opts.body);
    expect(body.chat_id).toBe('123');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('example.com');
    expect(body.text).toContain('запрещённое');
    expect(body.text).toContain('Открыть отчёт');
    expect(body.text).toContain('https://app.example.com/?jobId=job-123');
  });

  it('returns true without sending when no problems', async () => {
    const job: JobRecord = {
      jobId: 'job-123',
      mode: 'crawl',
      createdAt: Date.now(),
      progress: { status: 'done', processed: 1, failed: 0 },
      results: [
        { url: 'https://example.com', finalUrl: 'https://example.com', ok: true },
      ],
    };
    const result = await sendTelegramAlert(job, { botToken: 't', chatId: 'c' });
    expect(result).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
