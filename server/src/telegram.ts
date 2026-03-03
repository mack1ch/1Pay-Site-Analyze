import type { JobRecord } from './types.js';

const TELEGRAM_API = 'https://api.telegram.org';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Отправка уведомления в Telegram о проблемах по результатам проверки.
 * Использует TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID из env, либо переданные из расписания.
 */
export async function sendTelegramAlert(
  job: JobRecord,
  options: {
    botToken?: string | null;
    chatId?: string | null;
    baseUrl?: string;
  }
): Promise<boolean> {
  const botToken = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId ?? process.env.TELEGRAM_CHAT_ID;
  const baseUrl = options.baseUrl ?? process.env.BASE_URL ?? '';

  if (!botToken?.trim() || !chatId?.trim()) {
    return false;
  }

  const violations = job.results.filter((r) => r.forbiddenScan?.hasMatches);
  const blocked = job.results.filter((r) => r.blockedBySite);
  const failed = job.results.filter((r) => !r.ok && !r.blockedBySite);

  const hasProblems = violations.length > 0 || blocked.length > 0 || failed.length > 0;
  if (!hasProblems) {
    return true;
  }

  const reportLink = baseUrl ? `${baseUrl.replace(/\/$/, '')}/?jobId=${job.jobId}` : '';

  const parts: string[] = [];
  parts.push('⚠️ <b>Проверка сайта: обнаружены проблемы</b>\n');

  const siteUrl = job.results[0]?.finalUrl || job.results[0]?.url || '';
  try {
    const host = new URL(siteUrl).hostname;
    parts.push('🌐 Сайт: ' + escapeHtml(host) + '\n');
  } catch {
    parts.push('🌐 URL: ' + escapeHtml(siteUrl) + '\n');
  }

  if (violations.length > 0) {
    const terms = new Set<string>();
    for (const r of violations) {
      for (const m of r.forbiddenScan!.matchedTerms) {
        terms.add(m.term);
      }
    }
    parts.push('🔴 <b>Найдены запрещённые слова</b> (' + violations.length + ' стр.)\n');
    parts.push('Слова: ' + escapeHtml([...terms].join(', ')) + '\n');
    for (const r of violations.slice(0, 5)) {
      const url = r.finalUrl || r.url;
      const pageTerms = (r.forbiddenScan!.matchedTerms ?? []).map((m) => m.term).join(', ');
      parts.push('  • ' + escapeHtml(url) + ' — ' + escapeHtml(pageTerms) + '\n');
    }
    if (violations.length > 5) {
      parts.push('  … и ещё ' + (violations.length - 5) + ' стр.\n');
    }
    parts.push('\n');
  }

  if (blocked.length > 0) {
    parts.push('🟠 <b>Доступ заблокирован</b> (' + blocked.length + ' стр.) — 403/429 и т.п.\n');
    for (const r of blocked.slice(0, 3)) {
      parts.push('  • ' + escapeHtml(r.finalUrl || r.url) + '\n');
    }
    if (blocked.length > 3) parts.push('  … и ещё ' + (blocked.length - 3) + '\n');
    parts.push('\n');
  }

  if (failed.length > 0) {
    parts.push('🟡 <b>Ошибки загрузки</b> (' + failed.length + ' стр.)\n');
    for (const r of failed.slice(0, 3)) {
      parts.push('  • ' + escapeHtml(r.finalUrl || r.url) + ' — ' + escapeHtml(r.error || 'ошибка') + '\n');
    }
    if (failed.length > 3) parts.push('  … и ещё ' + (failed.length - 3) + '\n');
    parts.push('\n');
  }

  if (reportLink) {
    parts.push('📋 <a href="' + escapeHtml(reportLink) + '">Открыть отчёт</a>');
  }

  const text = parts.join('');

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn('[telegram] sendMessage failed:', res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[telegram] request failed:', (e as Error).message);
    return false;
  }
}

/** Минимальные поля расписания для текста подтверждения. */
export interface ScheduleConfirmationPayload {
  name: string;
  mode: 'list' | 'crawl';
  seedUrls?: string[];
  urls?: string[];
  cronExpression: string;
  timezone: string;
  endAt: number | null;
  enabled: boolean;
  telegramChatId: string | null;
  telegramBotToken: string | null;
}

/**
 * Отправка подтверждения в Telegram: поставлен/обновлён мониторинг по расписанию.
 * Отправляется в чат из расписания или из env (TELEGRAM_CHAT_ID / TELEGRAM_BOT_TOKEN).
 */
export async function sendTelegramScheduleConfirmation(
  schedule: ScheduleConfirmationPayload,
  options: { isUpdate?: boolean } = {}
): Promise<boolean> {
  const botToken = schedule.telegramBotToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = schedule.telegramChatId?.trim() || process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    return false;
  }

  const title = options.isUpdate ? '📋 Обновлено расписание мониторинга' : '✅ Поставлен мониторинг по расписанию';
  const lines: string[] = [title, ''];

  lines.push('📌 ' + (schedule.name || 'Без названия'));
  lines.push('Режим: ' + (schedule.mode === 'crawl' ? 'Обход сайта (crawl)' : 'Список URL'));

  if (schedule.mode === 'crawl' && schedule.seedUrls?.length) {
    const hosts = schedule.seedUrls.slice(0, 5).map((u) => {
      try {
        return new URL(u).hostname;
      } catch {
        return u;
      }
    });
    lines.push('Сайты: ' + escapeHtml(hosts.join(', ')) + (schedule.seedUrls.length > 5 ? ' …' : ''));
  } else if (schedule.mode === 'list' && schedule.urls?.length) {
    lines.push('URL: ' + schedule.urls.length + ' шт.');
  }

  lines.push('Расписание (cron): ' + escapeHtml(schedule.cronExpression));
  lines.push('Часовой пояс: ' + escapeHtml(schedule.timezone));
  lines.push('Статус: ' + (schedule.enabled ? 'Включено' : 'Выключено'));

  if (schedule.endAt != null) {
    const endStr = new Date(schedule.endAt).toLocaleString('ru-RU', {
      timeZone: schedule.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push('Действует до: ' + escapeHtml(endStr));
  }

  lines.push('');
  lines.push('Уведомления о проблемах будут приходить в этот чат.');

  const text = lines.join('\n');

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn('[telegram] schedule confirmation sendMessage failed:', res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[telegram] schedule confirmation request failed:', (e as Error).message);
    return false;
  }
}
