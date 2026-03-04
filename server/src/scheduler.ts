import { randomUUID } from 'crypto';
import {
  getSchedules,
  getScheduleGroups,
  getSchedulesByGroupId,
  getScheduleGroupById,
  getNextRunFromCron,
  getNextRunFromInterval,
  updateScheduleLastRun,
  updateScheduleRunningJob,
  updateGroupRunningJob,
  updateGroupLastRun,
  insertScheduleRunLog,
  saveReportStartedToHistory,
} from './db.js';
import type { ScheduleRecord } from './types.js';
import { createJob, getJob } from './job-store.js';
import { runJob, buildCrawlOptions } from './job-processor.js';
import { sendTelegramAlert } from './telegram.js';
import type { JobOptions } from './types.js';

const CHECK_INTERVAL_MS = 60_000;
const runningSchedules = new Set<string>();
const runningGroups = new Set<string>();

function getOptionsFromSchedule(schedule: ScheduleRecord): JobOptions {
  const opts: JobOptions = { ...schedule.options };
  if (schedule.forbiddenTerms.length > 0) {
    opts.forbidden = {
      terms: schedule.forbiddenTerms,
      settings: schedule.forbiddenSettings ?? {},
    };
  }
  return opts;
}

function getUrls(schedule: ScheduleRecord): string[] {
  if (schedule.mode === 'crawl' && schedule.seedUrls?.length) return schedule.seedUrls;
  if (Array.isArray(schedule.urls) && schedule.urls.length > 0) return schedule.urls;
  if (schedule.seedUrls?.length) return schedule.seedUrls;
  return [];
}

async function runScheduleJob(
  schedule: ScheduleRecord,
  now: number,
  onComplete?: () => Promise<void>
): Promise<void> {
  const urls = getUrls(schedule);
  if (urls.length === 0) return;

  const jobId = randomUUID();
  const total = schedule.mode === 'list' ? urls.length : undefined;
  const opts = getOptionsFromSchedule(schedule);
  const crawlOpts =
    schedule.mode === 'crawl' && schedule.seedUrls?.length ? buildCrawlOptions(schedule.seedUrls, opts) : null;

  createJob(jobId, schedule.mode, total, schedule.id);
  await updateScheduleRunningJob(schedule.id, jobId);
  await insertScheduleRunLog(schedule.id, jobId, 'started');
  console.log('[scheduler] Проверка запущена: job=%s, расписание=%s', jobId, schedule.name || schedule.id);
  saveReportStartedToHistory(jobId, schedule.mode, now, urls[0]).catch((err) =>
    console.warn('[scheduler] saveReportStarted failed:', err)
  );

  if (schedule.groupId) {
    await updateGroupRunningJob(schedule.groupId, jobId, schedule.id);
  }

  runJob(jobId, schedule.mode, urls, crawlOpts, opts, undefined)
    .then(async () => {
      const job = getJob(jobId);
      await insertScheduleRunLog(schedule.id, jobId, 'finished');
      await updateScheduleLastRun(schedule.id, jobId, now);
      if (job) {
        const hasProblems =
          (job.progress.violations ?? 0) > 0 ||
          job.results.some((r) => r.blockedBySite || !r.ok);
        if (hasProblems) {
          await sendTelegramAlert(job, {
            botToken: schedule.telegramBotToken,
            chatId: schedule.telegramChatId,
            baseUrl: process.env.BASE_URL,
          });
        }
      }
      await onComplete?.();
    })
    .catch(async (err) => {
      console.error('[scheduler] job failed:', schedule.id, err);
      await insertScheduleRunLog(schedule.id, jobId, 'failed');
      await updateScheduleLastRun(schedule.id, jobId, now);
      await onComplete?.();
    })
    .finally(() => {
      runningSchedules.delete(schedule.id);
      updateScheduleRunningJob(schedule.id, null).catch(() => {});
    });
}

async function continueGroupRun(groupId: string): Promise<void> {
  const group = await getScheduleGroupById(groupId);
  if (!group) {
    runningGroups.delete(groupId);
    return;
  }
  const schedules = await getSchedulesByGroupId(groupId);
  const currentIndex = group.runningScheduleId
    ? schedules.findIndex((s) => s.id === group.runningScheduleId) + 1
    : 0;
  const nextSchedule = schedules[currentIndex];
  if (!nextSchedule) {
    await updateGroupLastRun(groupId, Date.now());
    await updateGroupRunningJob(groupId, null, null);
    runningGroups.delete(groupId);
    return;
  }
  const now = Date.now();
  runningSchedules.add(nextSchedule.id);
  await runScheduleJob(nextSchedule, now, () => continueGroupRun(groupId));
}

async function runSchedulerTick(): Promise<void> {
  try {
    const now = Date.now();

    // Группы: интервал в минутах
    const groups = await getScheduleGroups(true);
    const cronSchedules = await getSchedules(true);
    const cronOnly = cronSchedules.filter((s) => !s.groupId);

    for (const group of groups) {
      if (runningGroups.has(group.id)) continue;
      if (group.runningJobId != null) continue; // уже идёт прогон по расписанию группы
      const nextRun = getNextRunFromInterval(group.intervalMinutes, group.lastRunAt, now);
      if (nextRun > now) continue;
      if (group.endAt != null && now >= group.endAt) continue;

      const schedules = await getSchedulesByGroupId(group.id);
      const enabledSchedules = schedules.filter((s) => s.enabled);
      if (enabledSchedules.length === 0) {
        console.warn('[scheduler] Группа "%s" (%s): нет включённых расписаний', group.name || 'Без названия', group.id);
        continue;
      }

      console.log('[scheduler] Запуск группы "%s" (%s), расписаний: %d', group.name || 'Без названия', group.id, enabledSchedules.length);
      runningGroups.add(group.id);
      const first = enabledSchedules[0];
      runningSchedules.add(first.id);
      await runScheduleJob(first, now, () => continueGroupRun(group.id));
    }

    // Отдельные расписания по cron (без группы)
    for (const schedule of cronOnly) {
      if (schedule.groupId != null) continue; // в группе — запускается через группу
      if (runningSchedules.has(schedule.id)) continue;
      const afterDate = schedule.lastRunAt ? new Date(schedule.lastRunAt) : new Date(now - 1000);
      const nextRun = getNextRunFromCron(schedule.cronExpression, schedule.timezone, afterDate);
      if (nextRun == null || nextRun > now) continue;
      if (schedule.endAt != null && nextRun >= schedule.endAt) continue;

      const urls = getUrls(schedule);
      if (urls.length === 0) continue;

      console.log('[scheduler] Запуск расписания "%s" (%s)', schedule.name || 'Без названия', schedule.id);
      runningSchedules.add(schedule.id);
      await runScheduleJob(schedule, now);
    }
  } catch (err) {
    console.error('[scheduler] Ошибка в тике:', err);
  }
}

export function startScheduler(): void {
  // Первый запуск через 3 сек после старта (чтобы БД была готова)
  setTimeout(() => {
    console.log('[scheduler] Первый запуск проверки расписаний');
    runSchedulerTick();
  }, 3000);
  setInterval(runSchedulerTick, CHECK_INTERVAL_MS);
}
