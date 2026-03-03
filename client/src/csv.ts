/**
 * Client-side CSV parse: detect delimiter and URL column (url, URL, link).
 */
export function parseCsvUrls(csvContent: string): string[] {
  const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const first = lines[0];
  let delimiter = ',';
  if (first.includes('\t')) delimiter = '\t';
  else if (first.includes(';') && !first.includes(',')) delimiter = ';';
  else if (first.includes(';') && first.includes(',')) {
    const semicolonCount = (first.match(/;/g) || []).length;
    const commaCount = (first.match(/,/g) || []).length;
    delimiter = semicolonCount >= commaCount ? ';' : ',';
  }

  const headers = first.split(delimiter).map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/^\uFEFF/, '')
  );
  const urlColumnIndex = headers.findIndex((h) => h === 'url' || h === 'link' || h === 'href');
  const urlIndex = urlColumnIndex >= 0 ? urlColumnIndex : 0;

  const seen = new Set<string>();
  const urls: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter);
    const cell = (parts[urlIndex] ?? '').trim().replace(/^["']|["']$/g, '');
    if (!cell) continue;
    if (/^https?:\/\//i.test(cell) && !seen.has(cell)) {
      seen.add(cell);
      urls.push(cell);
    }
  }
  return urls;
}
