import type { FastifyInstance } from 'fastify';
import { getDomainsWithHistory, getReportsByDomain } from '../db.js';

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
}
