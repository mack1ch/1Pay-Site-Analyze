import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'site_access';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 минут

export function getSitePin(): string | undefined {
  const pin = process.env.SITE_PIN?.trim();
  return pin === '' ? undefined : pin;
}

export function isPinProtectionEnabled(): boolean {
  return !!getSitePin();
}

/** Блокировки по IP: количество попыток и время разблокировки */
const blockStore = new Map<
  string,
  { attempts: number; blockedUntil?: number }
>();

function getClientId(request: { ip: string }): string {
  return request.ip || 'unknown';
}

function getBlockState(clientId: string): { attempts: number; blockedUntil?: number } {
  const state = blockStore.get(clientId);
  if (!state) return { attempts: 0 };
  if (state.blockedUntil != null && Date.now() < state.blockedUntil) {
    return state;
  }
  // Блокировка истекла — сбрасываем
  blockStore.set(clientId, { attempts: 0 });
  return { attempts: 0 };
}

export function recordFailedAttempt(request: { ip: string }): {
  blocked: boolean;
  remainingAttempts: number;
  blockedUntil?: number;
} {
  const clientId = getClientId(request);
  let state = blockStore.get(clientId) ?? { attempts: 0 };
  state = { ...state, attempts: state.attempts + 1 };
  if (state.attempts >= MAX_ATTEMPTS) {
    state.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
  blockStore.set(clientId, state);
  return {
    blocked: state.attempts >= MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - state.attempts),
    blockedUntil: state.blockedUntil,
  };
}

export function clearAttempts(request: { ip: string }): void {
  blockStore.delete(getClientId(request));
}

export function checkBlocked(request: { ip: string }): {
  blocked: boolean;
  blockedUntil?: number;
} {
  const state = getBlockState(getClientId(request));
  if (state.blockedUntil != null && Date.now() < state.blockedUntil) {
    return { blocked: true, blockedUntil: state.blockedUntil };
  }
  return { blocked: false };
}

function getSecret(): string {
  const pin = getSitePin();
  if (!pin) return 'no-pin';
  return pin;
}

export function createSignedCookie(): { name: string; value: string; options: string } {
  const payload = JSON.stringify({ t: Date.now(), v: 1 });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  const value = `${encoded}.${sig}`;
  const options = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`;
  return { name: COOKIE_NAME, value, options };
}

export function verifySignedCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.split(';').find((s) => s.trim().startsWith(COOKIE_NAME + '='));
  if (!match) return false;
  const value = match.split('=')[1]?.trim();
  if (!value) return false;
  const [encoded, sig] = value.split('.');
  if (!encoded || !sig) return false;
  try {
    const expected = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'))) {
      return false;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload?.v === 1 && typeof payload.t === 'number';
  } catch {
    return false;
  }
}

export function getAuthCookieName(): string {
  return COOKIE_NAME;
}
