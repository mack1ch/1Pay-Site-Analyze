import type { JobRecord, ResultItem } from './types.js';

const jobs = new Map<string, JobRecord>();

export function createJob(
  jobId: string,
  mode: 'list' | 'crawl',
  total?: number,
  scheduleId?: string
): JobRecord {
  const record: JobRecord = {
    jobId,
    mode,
    createdAt: Date.now(),
    progress: {
      status: 'queued',
      processed: 0,
      failed: 0,
      violations: 0,
      total,
      queued: total,
      discovered: mode === 'crawl' ? 0 : total,
    },
    results: [],
    scheduleId,
  };
  jobs.set(jobId, record);
  return record;
}

export function getJob(jobId: string): JobRecord | undefined {
  return jobs.get(jobId);
}

export function updateJobProgress(jobId: string, update: Partial<JobRecord['progress']>): void {
  const job = jobs.get(jobId);
  if (job) {
    job.progress = { ...job.progress, ...update };
  }
}

export function incrementJobProgress(
  jobId: string,
  processedDelta: number,
  failedDelta: number
): void {
  const job = jobs.get(jobId);
  if (job) {
    job.progress.processed += processedDelta;
    job.progress.failed += failedDelta;
  }
}

export function appendResult(jobId: string, item: ResultItem): void {
  const job = jobs.get(jobId);
  if (job) {
    job.results.push(item);
    if (item.forbiddenScan?.hasMatches) {
      job.progress.violations = (job.progress.violations ?? 0) + 1;
    }
  }
}

export function setJobCancelled(jobId: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.cancelled = true;
    job.progress.status = 'cancelled';
  }
}

export function setJobDiscovered(jobId: string, discovered: number): void {
  const job = jobs.get(jobId);
  if (job) {
    job.progress.discovered = discovered;
    if (job.progress.queued === undefined) job.progress.queued = discovered;
  }
}

export function setJobSummary(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  const withViolations = job.results.filter((r) => r.forbiddenScan?.hasMatches);
  const termCount = new Map<string, number>();
  for (const r of withViolations) {
    for (const m of r.forbiddenScan!.matchedTerms) {
      termCount.set(m.term, (termCount.get(m.term) ?? 0) + m.count);
    }
  }
  const topTerms = [...termCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));
  job.summary = {
    pagesProcessed: job.results.filter((r) => r.ok).length,
    pagesWithViolations: withViolations.length,
    topTerms,
  };
}
