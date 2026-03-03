import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import jobsRoutes from './jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('jobs API', () => {
  let app: Awaited<ReturnType<typeof Fastify>>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(cors, { origin: true });
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '..', '..', 'storage', 'screenshots'),
      prefix: '/static/screenshots/',
    });
    await app.register(jobsRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/jobs returns 400 when mode is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/jobs returns 400 when list mode has no urls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { mode: 'list', urls: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/jobs returns 202 and jobId for list mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        mode: 'list',
        urls: ['https://example.com'],
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body).toHaveProperty('jobId');
    expect(typeof body.jobId).toBe('string');
  });

  it('POST /api/jobs returns 400 for crawl without seedUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { mode: 'crawl' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/jobs returns 202 for crawl with seedUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        mode: 'crawl',
        seedUrl: 'https://example.com',
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toHaveProperty('jobId');
  });

  it('GET /api/jobs/:jobId returns job progress', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { mode: 'list', urls: ['https://example.com'] },
    });
    const { jobId } = create.json();
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('progress');
    expect(body.progress).toHaveProperty('status');
    expect(body.progress).toHaveProperty('processed');
  });

  it('GET /api/jobs/:jobId/results returns items', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { mode: 'list', urls: ['https://example.com'] },
    });
    const { jobId } = create.json();
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}/results` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /api/jobs/:jobId/cancel returns ok', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { mode: 'list', urls: ['https://example.com'] },
    });
    const { jobId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/cancel`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
