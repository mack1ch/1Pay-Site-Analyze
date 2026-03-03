import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import jobsRoutes from './routes/jobs.js';
import historyRoutes from './routes/history.js';
import scheduleRoutes from './routes/schedules.js';
import { initDb } from './db.js';
import { startScheduler } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'storage', 'screenshots');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

async function main() {
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  app.get('/api/health', async (_request, reply) => {
    return reply.send({ ok: true });
  });
  await app.register(fastifyStatic, {
    root: SCREENSHOTS_DIR,
    prefix: '/static/screenshots/',
  });
  await initDb();
  startScheduler();
  await app.register(jobsRoutes);
  await app.register(historyRoutes);
  await app.register(scheduleRoutes);

  // Serve built client (Docker / production): use not-found handler to avoid duplicating GET *
  // (fastify-static can register wildcard routes; setNotFoundHandler does not conflict)
  if (existsSync(PUBLIC_DIR)) {
    const publicResolved = path.resolve(PUBLIC_DIR);
    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split('?')[0] ?? '/';
      if (pathname.startsWith('/api') || pathname.startsWith('/static')) {
        return reply.code(404).send({ error: 'Не найдено' });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return reply.code(404).send({ error: 'Не найдено' });
      }
      const raw = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      const filePath = path.resolve(PUBLIC_DIR, raw);
      const rel = path.relative(publicResolved, filePath);
      if (rel.startsWith('..') || path.isAbsolute(rel) || !existsSync(filePath)) {
        return reply.sendFile('index.html', PUBLIC_DIR);
      }
      return reply.sendFile(rel.split(path.sep).join('/'), PUBLIC_DIR);
    });
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
