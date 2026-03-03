import pg from 'pg';
import fs from 'fs';
import cronParser from 'cron-parser';
import type { JobRecord, ScheduleRecord, JobOptions, ForbiddenSettings } from './types.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') return null;
  const config: pg.PoolConfig = {
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30000,
  };
  // Selectel и другие облачные БД: поддержка verify-ca через CA-сертификат
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  if (caPath) {
    try {
      config.ssl = {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath).toString(),
      };
    } catch (e) {
      console.error('[db] DATABASE_SSL_CA_PATH read failed:', e);
    }
  }
  pool = new Pool(config);
  return pool;
}

export async function initDb(): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS check_reports (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        mode TEXT NOT NULL,
        progress JSONB NOT NULL DEFAULT '{}',
        summary JSONB,
        results JSONB NOT NULL DEFAULT '[]'
      );
    `);
    await p.query(`
      CREATE TABLE IF NOT EXISTS check_report_domains (
        report_id UUID NOT NULL REFERENCES check_reports(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        PRIMARY KEY (report_id, domain)
      );
    `);
    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_check_report_domains_domain
      ON check_report_domains(domain);
    `);
    await p.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL,
        seed_url TEXT,
        urls JSONB NOT NULL DEFAULT '[]',
        cron_expression TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        end_at TIMESTAMPTZ,
        options JSONB NOT NULL DEFAULT '{}',
        forbidden_terms JSONB NOT NULL DEFAULT '[]',
        forbidden_settings JSONB NOT NULL DEFAULT '{}',
        telegram_chat_id TEXT,
        telegram_bot_token TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_run_at TIMESTAMPTZ,
        last_job_id UUID
      );
    `);
    return true;
  } catch (e) {
    console.error('[db] init failed:', e);
    return false;
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

/** Сохраняет отчёт в БД после завершения проверки. Вызывается из job-processor. */
export async function saveReportToHistory(jobId: string, job: JobRecord): Promise<void> {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query(
      `INSERT INTO check_reports (id, created_at, mode, progress, summary, results)
       VALUES ($1, to_timestamp($2 / 1000.0), $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         progress = EXCLUDED.progress,
         summary = EXCLUDED.summary,
         results = EXCLUDED.results`,
      [
        jobId,
        job.createdAt,
        job.mode,
        JSON.stringify(job.progress),
        job.summary ? JSON.stringify(job.summary) : null,
        JSON.stringify(job.results),
      ]
    );
    const domains = new Set<string>();
    for (const r of job.results) {
      const h = getHostname(r.finalUrl || r.url);
      if (h) domains.add(h);
    }
    await client.query('DELETE FROM check_report_domains WHERE report_id = $1', [jobId]);
    for (const domain of domains) {
      await client.query(
        'INSERT INTO check_report_domains (report_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [jobId, domain]
      );
    }
  } catch (e) {
    console.error('[db] saveReport failed:', e);
  } finally {
    client.release();
  }
}

export interface StoredReportMeta {
  jobId: string;
  createdAt: number;
  mode: string;
  summary: { pagesProcessed?: number; pagesWithViolations?: number } | null;
}

export async function getReportFromDb(jobId: string): Promise<JobRecord | null> {
  const p = getPool();
  if (!p) return null;
  const res = await p.query(
    'SELECT id, created_at, mode, progress, summary, results FROM check_reports WHERE id = $1',
    [jobId]
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  const createdAt = r.created_at instanceof Date ? r.created_at.getTime() : Number(new Date(r.created_at));
  return {
    jobId: r.id,
    mode: r.mode,
    createdAt,
    progress: typeof r.progress === 'object' ? r.progress : JSON.parse(r.progress || '{}'),
    summary: r.summary != null ? (typeof r.summary === 'object' ? r.summary : JSON.parse(r.summary)) : undefined,
    results: Array.isArray(r.results) ? r.results : JSON.parse(r.results || '[]'),
  };
}

export interface DomainHistoryItem {
  domain: string;
  reportCount: number;
  lastCheckedAt: number;
}

export async function getDomainsWithHistory(): Promise<DomainHistoryItem[]> {
  const p = getPool();
  if (!p) return [];
  const res = await p.query(`
    SELECT d.domain, COUNT(*)::int AS report_count, MAX(r.created_at) AS last_checked_at
    FROM check_report_domains d
    JOIN check_reports r ON r.id = d.report_id
    GROUP BY d.domain
    ORDER BY last_checked_at DESC
  `);
  return res.rows.map((row: { domain: string; report_count: number; last_checked_at: Date }) => ({
    domain: row.domain,
    reportCount: row.report_count,
    lastCheckedAt: row.last_checked_at instanceof Date
      ? row.last_checked_at.getTime()
      : Number(new Date(row.last_checked_at)),
  }));
}

export async function getReportsByDomain(domain: string): Promise<StoredReportMeta[]> {
  const p = getPool();
  if (!p) return [];
  const res = await p.query(
    `SELECT r.id, r.created_at, r.mode, r.summary
     FROM check_reports r
     JOIN check_report_domains d ON d.report_id = r.id
     WHERE d.domain = $1
     ORDER BY r.created_at DESC`,
    [domain]
  );
  return res.rows.map((row: { id: string; created_at: Date; mode: string; summary: unknown }) => ({
    jobId: row.id,
    createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Number(new Date(row.created_at)),
    mode: row.mode,
    summary: row.summary != null ? (typeof row.summary === 'object' ? row.summary : JSON.parse(String(row.summary))) : null,
  }));
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// --- Schedules ---

function rowToSchedule(r: Record<string, unknown>): ScheduleRecord {
  const createdAt = r.created_at instanceof Date ? r.created_at.getTime() : Number(new Date(r.created_at as string));
  const updatedAt = r.updated_at instanceof Date ? r.updated_at.getTime() : Number(new Date(r.updated_at as string));
  const lastRunAt = r.last_run_at != null
    ? (r.last_run_at instanceof Date ? r.last_run_at.getTime() : Number(new Date(r.last_run_at as string)))
    : null;
  const endAt = r.end_at != null
    ? (r.end_at instanceof Date ? r.end_at.getTime() : Number(new Date(r.end_at as string)))
    : null;
  return {
    id: r.id as string,
    name: (r.name as string) || '',
    mode: r.mode as ScheduleRecord['mode'],
    seedUrl: r.seed_url as string | null,
    urls: Array.isArray(r.urls) ? (r.urls as string[]) : JSON.parse(String(r.urls || '[]')),
    cronExpression: r.cron_expression as string,
    timezone: (r.timezone as string) || 'UTC',
    endAt,
    options: (typeof r.options === 'object' && r.options !== null ? r.options : JSON.parse(String(r.options || '{}'))) as JobOptions,
    forbiddenTerms: Array.isArray(r.forbidden_terms) ? (r.forbidden_terms as string[]) : JSON.parse(String(r.forbidden_terms || '[]')),
    forbiddenSettings: (typeof r.forbidden_settings === 'object' && r.forbidden_settings !== null ? r.forbidden_settings : JSON.parse(String(r.forbidden_settings || '{}'))) as ForbiddenSettings,
    telegramChatId: r.telegram_chat_id as string | null,
    telegramBotToken: r.telegram_bot_token as string | null,
    enabled: Boolean(r.enabled),
    createdAt,
    updatedAt,
    lastRunAt,
    lastJobId: r.last_job_id as string | null,
  };
}

export async function getSchedules(enabledOnly = false): Promise<ScheduleRecord[]> {
  const p = getPool();
  if (!p) return [];
  const res = await p.query(
    enabledOnly
      ? 'SELECT * FROM schedules WHERE enabled = true ORDER BY created_at DESC'
      : 'SELECT * FROM schedules ORDER BY created_at DESC'
  );
  return res.rows.map((r: Record<string, unknown>) => rowToSchedule(r));
}

export async function getScheduleById(id: string): Promise<ScheduleRecord | null> {
  const p = getPool();
  if (!p) return null;
  const res = await p.query('SELECT * FROM schedules WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  return rowToSchedule(res.rows[0] as Record<string, unknown>);
}

export interface ScheduleInsert {
  name: string;
  mode: 'list' | 'crawl';
  seedUrl?: string | null;
  urls?: string[];
  cronExpression: string;
  timezone?: string;
  endAt?: number | null;
  options?: JobOptions;
  forbiddenTerms?: string[];
  forbiddenSettings?: ForbiddenSettings;
  telegramChatId?: string | null;
  telegramBotToken?: string | null;
  enabled?: boolean;
}

export async function createSchedule(input: ScheduleInsert): Promise<ScheduleRecord> {
  const p = getPool();
  if (!p) throw new Error('Database not configured');
  const res = await p.query(
    `INSERT INTO schedules (
      name, mode, seed_url, urls, cron_expression, timezone, end_at, options,
      forbidden_terms, forbidden_settings, telegram_chat_id, telegram_bot_token, enabled
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      input.name || '',
      input.mode,
      input.seedUrl ?? null,
      JSON.stringify(input.urls ?? []),
      input.cronExpression,
      input.timezone ?? 'UTC',
      input.endAt != null ? new Date(input.endAt) : null,
      JSON.stringify(input.options ?? {}),
      JSON.stringify(input.forbiddenTerms ?? []),
      JSON.stringify(input.forbiddenSettings ?? {}),
      input.telegramChatId ?? null,
      input.telegramBotToken ?? null,
      input.enabled !== false,
    ]
  );
  return rowToSchedule(res.rows[0] as Record<string, unknown>);
}

export async function updateSchedule(id: string, input: Partial<ScheduleInsert>): Promise<ScheduleRecord | null> {
  const p = getPool();
  if (!p) return null;
  const existing = await getScheduleById(id);
  if (!existing) return null;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.name !== undefined) { updates.push(`name = $${idx++}`); values.push(input.name); }
  if (input.mode !== undefined) { updates.push(`mode = $${idx++}`); values.push(input.mode); }
  if (input.seedUrl !== undefined) { updates.push(`seed_url = $${idx++}`); values.push(input.seedUrl); }
  if (input.urls !== undefined) { updates.push(`urls = $${idx++}`); values.push(JSON.stringify(input.urls)); }
  if (input.cronExpression !== undefined) { updates.push(`cron_expression = $${idx++}`); values.push(input.cronExpression); }
  if (input.timezone !== undefined) { updates.push(`timezone = $${idx++}`); values.push(input.timezone); }
  if (input.endAt !== undefined) { updates.push(`end_at = $${idx++}`); values.push(input.endAt != null ? new Date(input.endAt) : null); }
  if (input.options !== undefined) { updates.push(`options = $${idx++}`); values.push(JSON.stringify(input.options)); }
  if (input.forbiddenTerms !== undefined) { updates.push(`forbidden_terms = $${idx++}`); values.push(JSON.stringify(input.forbiddenTerms)); }
  if (input.forbiddenSettings !== undefined) { updates.push(`forbidden_settings = $${idx++}`); values.push(JSON.stringify(input.forbiddenSettings)); }
  if (input.telegramChatId !== undefined) { updates.push(`telegram_chat_id = $${idx++}`); values.push(input.telegramChatId); }
  if (input.telegramBotToken !== undefined) { updates.push(`telegram_bot_token = $${idx++}`); values.push(input.telegramBotToken); }
  if (input.enabled !== undefined) { updates.push(`enabled = $${idx++}`); values.push(input.enabled); }
  if (updates.length === 0) return existing;
  updates.push(`updated_at = NOW()`);
  values.push(id);
  await p.query(
    `UPDATE schedules SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  );
  return getScheduleById(id);
}

export async function updateScheduleLastRun(id: string, jobId: string, lastRunAt: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    'UPDATE schedules SET last_run_at = $1, last_job_id = $2, updated_at = NOW() WHERE id = $3',
    [new Date(lastRunAt), jobId, id]
  );
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  const res = await p.query('DELETE FROM schedules WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Следующий запуск по cron (в миллисекундах). */
export function getNextRunFromCron(cronExpression: string, timezone: string, afterDate?: Date): number | null {
  try {
    const after = afterDate ?? new Date();
    const interval = cronParser.parseExpression(cronExpression, { currentDate: after, tz: timezone });
    const next = interval.next().toDate();
    return next.getTime();
  } catch {
    return null;
  }
}
