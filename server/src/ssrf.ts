import { lookup } from 'dns/promises';
import { isIP } from 'net';

const PRIVATE_RANGES = [
  // 10.0.0.0/8
  /^10\./,
  // 172.16.0.0/12
  /^172\.(1[6-9]|2\d|3[01])\./,
  // 192.168.0.0/16
  /^192\.168\./,
  // link-local 169.254.0.0/16
  /^169\.254\./,
  // metadata (cloud)
  /^169\.254\.169\.254$/,
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

function isPrivateOrBlockedIPv4(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '0.0.0.0') return true;
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

function isPrivateOrBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc00:') ||
    lower.startsWith('fd00:')
  )
    return true;
  // metadata
  if (lower.includes('169.254.169.254')) return true;
  return false;
}

export function isBlockedIP(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateOrBlockedIPv4(ip);
  if (isIP(ip) === 6) return isPrivateOrBlockedIPv6(ip);
  return true; // unknown
}

export async function resolveAndCheckSSRF(
  hostname: string
): Promise<{ ok: boolean; error?: string }> {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(normalized)) {
    return { ok: false, error: 'Заблокированный хост: ' + hostname };
  }
  try {
    const addresses = await lookup(normalized, { all: true, verbatim: true });
    for (const { address } of addresses) {
      if (isBlockedIP(address)) {
        return { ok: false, error: `Разрешён в заблокированный IP: ${address}` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Ошибка DNS: ${(e as Error).message}` };
  }
}

export function getHostnameFromURL(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname || null;
  } catch {
    return null;
  }
}
