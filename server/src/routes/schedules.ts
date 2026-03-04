import type { FastifyInstance } from 'fastify';
import {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getNextRunFromCron,
  getScheduleRunLog,
  type ScheduleInsert,
} from '../db.js';
import { config } from '../config.js';
import { sendTelegramScheduleConfirmation } from '../telegram.js';

function toResponse(record: Awaited<ReturnType<typeof getScheduleById>>) {
  if (!record) return null;
  const nextRun = getNextRunFromCron(
    record.cronExpression,
    record.timezone,
    record.lastRunAt ? new Date(record.lastRunAt) : undefined
  );
  return {
    ...record,
    nextRunAt: nextRun,
  };
}

export default async function scheduleRoutes(app: FastifyInstance) {
  app.get('/api/schedules', async (_request, reply) => {
    const list = await getSchedules(false);
    const withNext = await Promise.all(
      list.map(async (s) => {
        const nextRunAt = s.groupId
          ? null
          : getNextRunFromCron(
              s.cronExpression,
              s.timezone,
              s.lastRunAt ? new Date(s.lastRunAt) : undefined
            );
        return {
          ...s,
          nextRunAt,
          runLog: await getScheduleRunLog(s.id, 10),
        };
      })
    );
    return reply.send({ schedules: withNext });
  });

  app.get<{ Params: { id: string } }>('/api/schedules/:id', async (request, reply) => {
    const schedule = await getScheduleById(request.params.id);
    if (!schedule) return reply.code(404).send({ error: 'Расписание не найдено' });
    const runLog = await getScheduleRunLog(schedule.id, 20);
    return reply.send({ ...toResponse(schedule), runLog });
  });

  app.post<{ Body: ScheduleInsert }>('/api/schedules', async (request, reply) => {
    const body = request.body;
    if (!body.mode || !['list', 'crawl'].includes(body.mode)) {
      return reply.code(400).send({ error: 'Укажите mode: list или crawl' });
    }
    if (!body.groupId && !body.cronExpression?.trim()) {
      return reply.code(400).send({ error: 'Укажите cron_expression или group_id' });
    }
    if (body.mode === 'crawl') {
      const seedUrls = Array.isArray(body.seedUrls)
        ? body.seedUrls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(String(u).trim())).map((u) => String(u).trim())
        : body.seedUrl?.trim() && /^https?:\/\//i.test(body.seedUrl.trim())
          ? [body.seedUrl.trim()]
          : [];
      if (seedUrls.length === 0) {
        return reply.code(400).send({ error: 'Для обхода укажите хотя бы один стартовый URL (seedUrl или seedUrls)' });
      }
    } else {
      const urls = Array.isArray(body.urls) ? body.urls : [];
      if (urls.length === 0 || !urls.every((u) => typeof u === 'string' && /^https?:\/\//i.test(u))) {
        return reply.code(400).send({ error: 'Для списка укажите массив urls' });
      }
    }
    try {
      const crawlSeedUrls =
        body.mode === 'crawl'
          ? (Array.isArray(body.seedUrls)
              ? body.seedUrls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(String(u).trim())).map((u) => String(u).trim())
              : body.seedUrl?.trim() && /^https?:\/\//i.test(body.seedUrl.trim())
                ? [body.seedUrl.trim()]
                : [])
          : [];
      const schedule = await createSchedule({
        name: body.name ?? '',
        mode: body.mode,
        seedUrls: body.mode === 'crawl' ? crawlSeedUrls : undefined,
        urls: body.mode === 'list' ? body.urls : [],
        cronExpression: body.groupId ? '' : (body.cronExpression ?? '').trim(),
        timezone: body.timezone ?? config.defaultTimezone,
        endAt: body.endAt ?? null,
        options: body.options ?? {},
        forbiddenTerms: body.forbiddenTerms ?? [],
        forbiddenSettings: body.forbiddenSettings ?? {},
        telegramChatId: body.telegramChatId ?? null,
        telegramBotToken: body.telegramBotToken ?? null,
        enabled: body.enabled !== false,
        notifyAlways: body.notifyAlways === true,
        groupId: body.groupId ?? null,
        sortOrder: body.sortOrder ?? 0,
      });
      sendTelegramScheduleConfirmation(schedule, { isUpdate: false }).catch((err) =>
        console.warn('[schedules] confirmation telegram failed:', err)
      );
      return reply.code(201).send(toResponse(schedule));
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });

  app.put<{ Params: { id: string }; Body: Partial<ScheduleInsert> }>('/api/schedules/:id', async (request, reply) => {
    const updated = await updateSchedule(request.params.id, request.body);
    if (!updated) return reply.code(404).send({ error: 'Расписание не найдено' });
    sendTelegramScheduleConfirmation(updated, { isUpdate: true }).catch((err) =>
      console.warn('[schedules] confirmation telegram failed:', err)
    );
    return reply.send(toResponse(updated));
  });

  app.delete<{ Params: { id: string } }>('/api/schedules/:id', async (request, reply) => {
    const ok = await deleteSchedule(request.params.id);
    if (!ok) return reply.code(404).send({ error: 'Расписание не найдено' });
    return reply.send({ ok: true });
  });
}
