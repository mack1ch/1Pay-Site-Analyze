import type { FastifyInstance } from 'fastify';
import {
  getSitePin,
  isPinProtectionEnabled,
  verifySignedCookie,
  createSignedCookie,
  recordFailedAttempt,
  clearAttempts,
  checkBlocked,
} from '../auth.js';

export default async function authRoutes(app: FastifyInstance) {
  /** Проверка: авторизован ли пользователь (валидная cookie). */
  app.get('/api/auth/status', async (request, reply) => {
    if (!isPinProtectionEnabled()) {
      return reply.send({ ok: true });
    }
    const cookieHeader = request.headers.cookie;
    if (verifySignedCookie(cookieHeader)) {
      return reply.send({ ok: true });
    }
    return reply.code(401).send({ ok: false, error: 'Требуется ввод пин-кода' });
  });

  /** Проверка пин-кода. При успехе выставляет cookie и возвращает 200. */
  app.post<{ Body: { pin?: string } }>('/api/auth/verify', async (request, reply) => {
    const pin = getSitePin();
    if (!pin) {
      return reply.send({ ok: true });
    }

    const blocked = checkBlocked(request);
    if (blocked.blocked) {
      return reply.code(403).send({
        error: 'Слишком много неверных попыток. Доступ временно заблокирован.',
        blockedUntil: blocked.blockedUntil,
      });
    }

    const submitted = request.body?.pin?.trim() ?? '';
    if (submitted === '') {
      return reply.code(400).send({ error: 'Введите пин-код' });
    }

    if (submitted !== pin) {
      const result = recordFailedAttempt(request);
      return reply.code(401).send({
        error: 'Неверный пин-код',
        remainingAttempts: result.remainingAttempts,
        blocked: result.blocked,
        blockedUntil: result.blockedUntil,
      });
    }

    clearAttempts(request);
    const { name, value, options } = createSignedCookie();
    reply.header('Set-Cookie', `${name}=${value}; ${options}`);
    return reply.send({ ok: true });
  });
}
