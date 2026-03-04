import type { FastifyInstance } from 'fastify';
import { getDomainsWithHistory, getReportsByDomain, getRecentReports } from '../db.js';

export default async function historyRoutes(app: FastifyInstance) {
  app.get('/api/history/domains', async (_request, reply) => {
    const domains = await getDomainsWithHistory();
    return reply.send({ domains });
  });

  app.get<{ Params: { domain: string } }>('/api/history/domains/:domain/reports', async (request, reply) => {
    const { domain } = request.params;
    const decoded = decodeURIComponent(domain);
    const reports = await getReportsByDomain(decoded);
    return reply.send({ reports });
  });

  /** Последние проверки (все, общие для всех пользователей). */
  app.get<{ Querystring: { limit?: string } }>('/api/history/reports', async (request, reply) => {
    const limit = Math.min(500, Math.max(1, parseInt(request.query.limit || '100', 10) || 100));
    const reports = await getRecentReports(limit);
    return reply.send({ reports });
  });
}
