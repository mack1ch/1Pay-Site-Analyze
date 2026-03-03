import type { FastifyInstance } from 'fastify';
import {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getNextRunFromCron,
  type ScheduleInsert,
} from '../db.js';

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
    const withNext = list.map((s) => ({
      ...s,
      nextRunAt: getNextRunFromCron(
        s.cronExpression,
        s.timezone,
        s.lastRunAt ? new Date(s.lastRunAt) : undefined
      ),
    }));
    return reply.send({ schedules: withNext });
  });

  app.get<{ Params: { id: string } }>('/api/schedules/:id', async (request, reply) => {
    const schedule = await getScheduleById(request.params.id);
    if (!schedule) return reply.code(404).send({ error: 'Расписание не найдено' });
    return reply.send(toResponse(schedule));
  });

  app.post<{ Body: ScheduleInsert }>('/api/schedules', async (request, reply) => {
    const body = request.body;
    if (!body.mode || !['list', 'crawl'].includes(body.mode)) {
      return reply.code(400).send({ error: 'Укажите mode: list или crawl' });
    }
    if (!body.cronExpression?.trim()) {
      return reply.code(400).send({ error: 'Укажите cron_expression' });
    }
    if (body.mode === 'crawl') {
      const url = body.seedUrl?.trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        return reply.code(400).send({ error: 'Для обхода укажите seedUrl' });
      }
    } else {
      const urls = Array.isArray(body.urls) ? body.urls : [];
      if (urls.length === 0 || !urls.every((u) => typeof u === 'string' && /^https?:\/\//i.test(u))) {
        return reply.code(400).send({ error: 'Для списка укажите массив urls' });
      }
    }
    try {
      const schedule = await createSchedule({
        name: body.name ?? '',
        mode: body.mode,
        seedUrl: body.mode === 'crawl' ? body.seedUrl : null,
        urls: body.mode === 'list' ? body.urls : [],
        cronExpression: body.cronExpression.trim(),
        timezone: body.timezone ?? 'UTC',
        endAt: body.endAt ?? null,
        options: body.options ?? {},
        forbiddenTerms: body.forbiddenTerms ?? [],
        forbiddenSettings: body.forbiddenSettings ?? {},
        telegramChatId: body.telegramChatId ?? null,
        telegramBotToken: body.telegramBotToken ?? null,
        enabled: body.enabled !== false,
      });
      return reply.code(201).send(toResponse(schedule));
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });

  app.put<{ Params: { id: string }; Body: Partial<ScheduleInsert> }>('/api/schedules/:id', async (request, reply) => {
    const updated = await updateSchedule(request.params.id, request.body);
    if (!updated) return reply.code(404).send({ error: 'Расписание не найдено' });
    return reply.send(toResponse(updated));
  });

  app.delete<{ Params: { id: string } }>('/api/schedules/:id', async (request, reply) => {
    const ok = await deleteSchedule(request.params.id);
    if (!ok) return reply.code(404).send({ error: 'Расписание не найдено' });
    return reply.send({ ok: true });
  });
}
