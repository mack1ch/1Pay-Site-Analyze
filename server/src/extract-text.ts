import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { config } from './config.js';

const MAX_CHARS = config.fetch.maxTextChars;

function fallbackExtract(doc: Document): string {
  const clone = doc.cloneNode(true) as Document;
  const body = clone.body;
  if (!body) return '';

  const removeSelectors = [
    'script',
    'style',
    'nav',
    'footer',
    'header',
    'aside',
    '[aria-hidden="true"]',
    '[role="navigation"]',
    '[role="banner"]',
    'noscript',
    'iframe',
  ];
  for (const sel of removeSelectors) {
    for (const el of body.querySelectorAll(sel)) {
      el.remove();
    }
  }
  return normalizeWhitespace(body.textContent ?? '');
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .trim();
}

export interface Extracted {
  title: string;
  text: string;
  truncated: boolean;
}

export function extractReadableText(html: string, url: string, maxChars?: number): Extracted {
  const limit = maxChars ?? MAX_CHARS;
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  let title = '';
  let text = '';

  try {
    const reader = new Readability(doc, { charThreshold: 100 });
    const article = reader.parse();
    if (article) {
      title = article.title ?? '';
      text = normalizeWhitespace(article.textContent ?? '');
    }
  } catch {
    // fallback
  }

  if (!text) {
    title = doc.querySelector('title')?.textContent ?? '';
    text = fallbackExtract(doc);
  }

  let truncated = false;
  if (text.length > limit) {
    text = text.slice(0, limit);
    truncated = true;
  }

  return { title, text, truncated };
}
