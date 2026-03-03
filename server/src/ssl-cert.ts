import https from 'https';

export interface SSLCertInfo {
  /** Дата выдачи сертификата (ISO 8601). */
  validFrom: string;
  /** Дата истечения (ISO 8601). */
  validTo: string;
}

/**
 * Получает даты действия SSL-сертификата по URL (только HTTPS).
 * При ошибке или не-HTTPS возвращает undefined.
 */
export function fetchSSLCertDates(url: string, timeoutMs = 8000): Promise<SSLCertInfo | undefined> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        resolve(undefined);
        return;
      }
    } catch {
      resolve(undefined);
      return;
    }

    const req = https.get(url, {
      timeout: timeoutMs,
      headers: { 'User-Agent': 'LinkTextExtractor/1.0' },
      rejectUnauthorized: true,
    }, (res) => {
      const socket = res.socket as import('tls').TLSSocket;
      const cert = socket?.getPeerCertificate?.(false);
      res.destroy();
      if (!cert || typeof cert !== 'object' || !cert.valid_from) {
        resolve(undefined);
        return;
      }
      const validFrom = parseCertDate(cert.valid_from);
      const validTo = parseCertDate(cert.valid_to);
      if (validFrom && validTo) {
        resolve({ validFrom, validTo });
      } else {
        resolve(undefined);
      }
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
    req.on('error', () => resolve(undefined));
  });
}

function parseCertDate(s: string): string {
  if (!s || typeof s !== 'string') return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Порог в днях: если сертификат выдан недавнее этого срока — считаем дату аномально недавней. */
export const SSL_RECENT_DAYS_THRESHOLD = 90;

export function isSSLRecentlyIssued(validFromISO: string, thresholdDays = SSL_RECENT_DAYS_THRESHOLD): boolean {
  const d = new Date(validFromISO);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const daysAgo = (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
  return daysAgo < thresholdDays;
}
