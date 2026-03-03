/**
 * Parse forbidden terms from CSV: one term per line, first column or whole line.
 * Dedupe and trim.
 */
export function parseForbiddenTermsFromCsv(csvContent: string): string[] {
  const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const first = lines[0];
  const hasComma = first.includes(',');
  const hasSemicolon = first.includes(';');
  const delimiter = hasSemicolon && !hasComma ? ';' : ',';
  const seen = new Set<string>();
  const terms: string[] = [];
  const start = lines[0].includes(',') || lines[0].includes(';') ? 1 : 0; // skip header if CSV-like
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const cell = (line.split(delimiter)[0] ?? line).trim().replace(/^["']|["']$/g, '');
    if (cell && !seen.has(cell.toLowerCase())) {
      seen.add(cell.toLowerCase());
      terms.push(cell);
    }
  }
  return terms;
}

export function parseForbiddenTermsFromText(text: string): string[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const line of lines) {
    if (!seen.has(line.toLowerCase())) {
      seen.add(line.toLowerCase());
      terms.push(line);
    }
  }
  return terms;
}
