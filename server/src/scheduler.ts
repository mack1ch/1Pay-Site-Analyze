import { randomUUID } from 'crypto';
import {
  getSchedules,
  getNextRunFromCron,
  updateScheduleLastRun,
  updateScheduleRunningJob,
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

export function startScheduler(): void {
  setInterval(async () => {
    const schedules = await getSchedules(true);
    const now = Date.now();
    for (const schedule of schedules) {
      if (runningSchedules.has(schedule.id)) continue;
      const afterDate = schedule.lastRunAt ? new Date(schedule.lastRunAt) : new Date(now - 1000);
      const nextRun = getNextRunFromCron(schedule.cronExpression, schedule.timezone, afterDate);
      if (nextRun == null || nextRun > now) continue;
      if (schedule.endAt != null && nextRun >= schedule.endAt) continue;

      const urls =
        schedule.mode === 'crawl' && schedule.seedUrls?.length
          ? schedule.seedUrls
          : Array.isArray(schedule.urls) && schedule.urls.length > 0
            ? schedule.urls
            : schedule.seedUrls?.length
              ? schedule.seedUrls
              : [];
      if (urls.length === 0) continue;

      runningSchedules.add(schedule.id);
      const jobId = randomUUID();
      const total = schedule.mode === 'list' ? urls.length : undefined;
      const opts = getOptionsFromSchedule(schedule);
      const crawlOpts =
        schedule.mode === 'crawl' && schedule.seedUrls?.length ? buildCrawlOptions(schedule.seedUrls, opts) : null;

      createJob(jobId, schedule.mode, total, schedule.id);

      const firstUrl = urls[0];
      await updateScheduleRunningJob(schedule.id, jobId);
      await insertScheduleRunLog(schedule.id, jobId, 'started');
      saveReportStartedToHistory(jobId, schedule.mode, now, firstUrl).catch((err) =>
        console.warn('[scheduler] saveReportStarted failed:', err)
      );

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
        })
        .catch(async (err) => {
          console.error('[scheduler] job failed:', schedule.id, err);
          await insertScheduleRunLog(schedule.id, jobId, 'failed');
          await updateScheduleLastRun(schedule.id, jobId, now);
        })
        .finally(() => {
          runningSchedules.delete(schedule.id);
          updateScheduleRunningJob(schedule.id, null).catch(() => {});
        });
    }
  }, CHECK_INTERVAL_MS);
}
