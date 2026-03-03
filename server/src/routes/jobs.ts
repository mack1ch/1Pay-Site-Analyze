import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createJob, getJob, setJobCancelled } from '../job-store.js';
import { getReportFromDb } from '../db.js';
import { runJob, buildCrawlOptions } from '../job-processor.js';
import { parseUrlsFromText } from '../url-utils.js';
import { parseCsvUrls } from '../csv.js';
import type { JobCreateBody, JobOptions } from '../types.js';

const RUNNING_JOBS = new Map<string, AbortController>();

export default async function jobsRoutes(app: FastifyInstance) {
  app.post<{ Body: JobCreateBody }>('/api/jobs', async (request, reply) => {
    const body = request.body;
    if (!body.mode || !['list', 'crawl'].includes(body.mode)) {
      return reply.code(400).send({ error: 'Неверный режим: укажите "list" или "crawl"' });
    }

    let urls: string[] = [];
    const opts: JobOptions = body.options ?? {};

    if (body.mode === 'list') {
      if (body.urls && Array.isArray(body.urls)) {
        urls = [...new Set(body.urls)].filter(
          (u) => typeof u === 'string' && /^https?:\/\//i.test(u)
        );
      }
      if (urls.length === 0) {
        return reply.code(400).send({ error: 'Для режима «список» нужен хотя бы один URL' });
      }
    } else {
      const seedUrlsRaw =
        body.seedUrls && Array.isArray(body.seedUrls)
          ? body.seedUrls
          : typeof body.seedUrl === 'string' && body.seedUrl.trim()
            ? [body.seedUrl.trim()]
            : [];
      urls = [...new Set(seedUrlsRaw)]
        .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(String(u).trim()))
        .map((u) => String(u).trim());
      if (urls.length === 0) {
        return reply.code(400).send({ error: 'Для режима обхода укажите хотя бы один стартовый URL (seedUrl или seedUrls)' });
      }
    }

    const jobId = randomUUID();
    const total = body.mode === 'list' ? urls.length : undefined;
    createJob(jobId, body.mode, total);

    const controller = new AbortController();
    RUNNING_JOBS.set(jobId, controller);

    const crawlOpts = body.mode === 'crawl' && urls.length > 0 ? buildCrawlOptions(urls, opts) : null;

    runJob(jobId, body.mode, urls, crawlOpts, opts, controller.signal)
      .catch((err) => {
        const job = getJob(jobId);
        if (job && job.progress.status === 'running') {
          job.progress.status = 'failed';
        }
        request.log.error(err, 'Job failed');
      })
      .finally(() => {
        RUNNING_JOBS.delete(jobId);
      });

    return reply.code(202).send({ jobId });
  });

  app.get<{ Params: { jobId: string } }>('/api/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    let job: Awaited<ReturnType<typeof getJob>> | Awaited<ReturnType<typeof getReportFromDb>> = getJob(jobId);
    if (!job) {
      job = await getReportFromDb(jobId);
    }
    if (!job) return reply.code(404).send({ error: 'Задача не найдена' });
    const status =
      job.progress.status === 'completed' ? 'done' : job.progress.status;
    return reply.send({
      jobId: job.jobId,
      mode: job.mode,
      createdAt: job.createdAt,
      status,
      progress: job.progress,
      summary: job.summary,
    });
  });

  app.get<{
    Params: { jobId: string };
    Querystring: { cursor?: string; limit?: string };
  }>('/api/jobs/:jobId/results', async (request, reply) => {
    const { jobId } = request.params;
    const cursor = parseInt(request.query.cursor ?? '0', 10);
    const limit = Math.min(100, parseInt(request.query.limit ?? '50', 10) || 50);
    let job: Awaited<ReturnType<typeof getJob>> | Awaited<ReturnType<typeof getReportFromDb>> = getJob(jobId);
    if (!job) {
      job = await getReportFromDb(jobId);
    }
    if (!job) return reply.code(404).send({ error: 'Задача не найдена' });
    const items = job.results.slice(cursor, cursor + limit);
    const nextCursor =
      cursor + items.length < job.results.length ? String(cursor + limit) : undefined;
    return reply.send({ items, nextCursor });
  });

  app.post<{ Params: { jobId: string } }>('/api/jobs/:jobId/cancel', async (request, reply) => {
    const { jobId } = request.params;
    const job = getJob(jobId);
    if (!job) return reply.code(404).send({ error: 'Задача не найдена' });
    setJobCancelled(jobId);
    const controller = RUNNING_JOBS.get(jobId);
    if (controller) controller.abort();
    return reply.send({ ok: true });
  });
}

export function parseUrlsFromInput(rawUrls: string, csvContent?: string): string[] {
  if (csvContent && csvContent.trim().length > 0) {
    const fromCsv = parseCsvUrls(csvContent);
    if (fromCsv.length > 0) return fromCsv;
  }
  return parseUrlsFromText(rawUrls);
}
