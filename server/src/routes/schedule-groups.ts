import type { FastifyInstance } from 'fastify';
import {
  getScheduleGroups,
  getScheduleGroupById,
  getSchedulesByGroupId,
  createScheduleGroup,
  updateScheduleGroup,
  deleteScheduleGroup,
  getNextRunFromInterval,
  getScheduleRunLog,
  type ScheduleGroupInsert,
} from '../db.js';

function toResponse(record: Awaited<ReturnType<typeof getScheduleGroupById>>) {
  if (!record) return null;
  const nextRunAt = getNextRunFromInterval(record.intervalMinutes, record.lastRunAt);
  return {
    ...record,
    nextRunAt,
  };
}

export default async function scheduleGroupRoutes(app: FastifyInstance) {
  app.get('/api/schedule-groups', async (_request, reply) => {
    const list = await getScheduleGroups(false);
    const withNext = await Promise.all(
      list.map(async (g) => {
        const schedules = await getSchedulesByGroupId(g.id);
        const schedulesWithLog = await Promise.all(
          schedules.map(async (s) => ({
            ...s,
            runLog: await getScheduleRunLog(s.id, 5),
          }))
        );
        return {
          ...g,
          nextRunAt: getNextRunFromInterval(g.intervalMinutes, g.lastRunAt),
          schedules: schedulesWithLog,
        };
      })
    );
    return reply.send({ groups: withNext });
  });

  app.get<{ Params: { id: string } }>('/api/schedule-groups/:id', async (request, reply) => {
    const group = await getScheduleGroupById(request.params.id);
    if (!group) return reply.code(404).send({ error: 'Группа не найдена' });
    const schedules = await getSchedulesByGroupId(group.id);
    const runLog = schedules.length > 0
      ? (await getScheduleRunLog(schedules[0].id, 5)).concat(
          schedules.length > 1 ? await getScheduleRunLog(schedules[schedules.length - 1].id, 5) : []
        )
      : [];
    return reply.send({
      ...toResponse(group),
      schedules,
      runLog: runLog.slice(0, 20),
    });
  });

  app.post<{ Body: ScheduleGroupInsert }>('/api/schedule-groups', async (request, reply) => {
    const body = request.body;
    const intervalMinutes = Math.max(1, Math.min(43200, Number(body.intervalMinutes) || 60));
    try {
      const group = await createScheduleGroup({
        name: body.name ?? '',
        intervalMinutes,
        timezone: body.timezone ?? 'Europe/Moscow',
        endAt: body.endAt ?? null,
        enabled: body.enabled !== false,
      });
      return reply.code(201).send(toResponse(group));
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });

  app.put<{ Params: { id: string }; Body: Partial<ScheduleGroupInsert> }>(
    '/api/schedule-groups/:id',
    async (request, reply) => {
      const body = request.body;
      const updates: Partial<ScheduleGroupInsert> = { ...body };
      if (body.intervalMinutes != null) {
        updates.intervalMinutes = Math.max(1, Math.min(43200, Number(body.intervalMinutes)));
      }
      const updated = await updateScheduleGroup(request.params.id, updates);
      if (!updated) return reply.code(404).send({ error: 'Группа не найдена' });
      return reply.send(toResponse(updated));
    }
  );

  app.delete<{ Params: { id: string } }>('/api/schedule-groups/:id', async (request, reply) => {
    const ok = await deleteScheduleGroup(request.params.id);
    if (!ok) return reply.code(404).send({ error: 'Группа не найдена' });
    return reply.send({ ok: true });
  });
}
