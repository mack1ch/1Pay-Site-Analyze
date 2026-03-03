const URL_LINE_REGEX = /^(https?:\/\/[^\s]+)/i;
const URL_ANYWHERE_REGEX = /(https?:\/\/[^\s]+)/i;
const HTTP_HTTPS_REGEX = /^https?:\/\//i;

export function isValidHttpUrl(str: string): boolean {
  try {
    const u = new URL(str.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractUrlFromLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let m = trimmed.match(URL_LINE_REGEX);
  if (m) return m[1].replace(/[.,;:!?]+$/, '');
  m = trimmed.match(URL_ANYWHERE_REGEX);
  if (m) return m[1].replace(/[.,;:!?]+$/, '');
  if (HTTP_HTTPS_REGEX.test(trimmed)) return trimmed;
  return null;
}

export function normalizeUrlForCrawl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.sort();
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    u.hostname = u.hostname.toLowerCase();
    if (u.port === '80' && u.protocol === 'http:') u.port = '';
    if (u.port === '443' && u.protocol === 'https:') u.port = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function sameOrigin(base: URL, target: string): boolean {
  try {
    const t = new URL(target, base.toString());
    return t.hostname.toLowerCase() === base.hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function toAbsoluteUrl(baseUrl: string, href: string): string | null {
  if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href.trim())) return null;
  try {
    const u = new URL(href, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function parseUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const url = extractUrlFromLine(line);
    if (url && isValidHttpUrl(url) && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
