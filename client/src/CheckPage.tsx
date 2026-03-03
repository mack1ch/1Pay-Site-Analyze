import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout, Alert, Tooltip, Button } from 'antd';
import {
  createJob,
  getJob,
  getResults,
  cancelJob,
  type ResultItem,
  type JobOptions,
  type JobProgress,
  type JobSummary,
  type ForbiddenSettings,
} from './api';
import { InputSection } from './InputSection';
import { ForbiddenSection } from './ForbiddenSection';
import { RunControls } from './RunControls';
import { ResultsSection } from './ResultsSection';

const { Content } = Layout;

export default function CheckPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobMode, setJobMode] = useState<'list' | 'crawl' | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'violations' | 'success';
    violationsCount?: number;
  } | null>(null);
  const [startSuccess, setStartSuccess] = useState(false);
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [forbiddenTerms, setForbiddenTerms] = useState<string[]>([]);
  const [forbiddenSettings, setForbiddenSettings] = useState<ForbiddenSettings>({});

  const pollJob = useCallback(async (id: string) => {
    const job = await getJob(id);
    setProgress(job.progress);
    if (job.summary) setSummary(job.summary);
    const status = job.status || job.progress.status;
    if (status === 'running' || status === 'queued' || status === 'pending') {
      const { items } = await getResults(id, 0, 500);
      setResults(items);
      return true;
    }
    const { items } = await getResults(id, 0, 5000);
    setResults(items);
    return false;
  }, []);

  useEffect(() => {
    const id = searchParams.get('jobId');
    if (!id) return;
    let cancelled = false;
    setError(null);
    getJob(id)
      .then((job) => {
        if (cancelled) return;
        setJobId(id);
        setJobMode((job.mode === 'crawl' ? 'crawl' : 'list') as 'list' | 'crawl');
        setProgress(job.progress);
        setSummary(job.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setError('Отчёт не найден');
      });
    getResults(id, 0, 5000)
      .then(({ items }) => {
        if (!cancelled) setResults(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleStart = useCallback(
    async (
      mode: 'list' | 'crawl',
      urls: string[],
      seedUrl: string | undefined,
      options: JobOptions
    ) => {
      setError(null);
      setNotification(null);
      setSearchParams({});
      setLoading(true);
      try {
        const fullOptions: JobOptions = {
          ...options,
          forbidden:
            forbiddenTerms.length > 0
              ? { terms: forbiddenTerms, settings: forbiddenSettings }
              : undefined,
        };
        const { jobId: id } = await createJob({
          mode,
          urls: mode === 'list' ? urls : undefined,
          seedUrl: mode === 'crawl' ? seedUrl : undefined,
          options: fullOptions,
        });
        setJobId(id);
        setJobMode(mode);
        setStartSuccess(true);
        setProgress({
          status: 'queued',
          processed: 0,
          failed: 0,
          queued: urls.length,
          total: urls.length,
          violations: 0,
        });
        setResults([]);
        const interval = setInterval(async () => {
          const more = await pollJob(id);
          if (!more) {
            clearInterval(interval);
            const job = await getJob(id);
            const violations = job.progress.violations ?? 0;
            if (violations > 0) {
              setNotification({ type: 'violations', violationsCount: violations });
            } else {
              setNotification({ type: 'success' });
            }
          }
        }, 1500);
        (window as unknown as { __pollInterval?: number }).__pollInterval = interval;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [forbiddenTerms, forbiddenSettings, pollJob, setSearchParams]
  );

  const handleCancel = useCallback(async () => {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
      await pollJob(jobId);
    } catch {
      // ignore
    }
  }, [jobId, pollJob]);

  const reset = useCallback(() => {
    const interval = (window as unknown as { __pollInterval?: number }).__pollInterval;
    if (interval) clearInterval(interval);
    setJobId(null);
    setJobMode(null);
    setResults([]);
    setProgress(null);
    setSummary(null);
    setNotification(null);
    setStartSuccess(false);
    setSearchParams({});
  }, [setSearchParams]);

  const isRunning =
    progress?.status === 'running' || progress?.status === 'pending' || progress?.status === 'queued';
  const isDone =
    progress?.status === 'done' ||
    progress?.status === 'completed' ||
    progress?.status === 'cancelled' ||
    progress?.status === 'failed';

  return (
    <Content style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
      <InputSection onStart={handleStart} loading={loading} />

      <ForbiddenSection
        terms={forbiddenTerms}
        onTermsChange={setForbiddenTerms}
        settings={forbiddenSettings}
        onSettingsChange={setForbiddenSettings}
        disabled={loading}
      />

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {startSuccess && (
        <Alert
          type="success"
          message="Сканирование успешно запущено"
          description="Смотрите прогресс и результаты внизу. Таблица будет обновляться по мере обработки страниц."
          showIcon
          closable
          onClose={() => setStartSuccess(false)}
          style={{ marginBottom: 16 }}
        />
      )}

      <RunControls
        progress={progress}
        onCancel={handleCancel}
        onReset={reset}
        isRunning={isRunning}
        isDone={isDone}
      />

      {notification && (
        <Alert
          type={notification.type === 'violations' ? 'warning' : 'success'}
          message={
            notification.type === 'violations' ? (
              <>
                <strong>Найдено нарушений: {notification.violationsCount}</strong>
                <Tooltip title="Оставить в таблице только страницы с найденными запрещёнными словами">
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setNotification(null)}
                    style={{ marginLeft: 8 }}
                  >
                    Показать только нарушения
                  </Button>
                </Tooltip>
              </>
            ) : (
              'Нарушений не найдено.'
            )
          }
          showIcon
          closable
          onClose={() => setNotification(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {results.length > 0 && (
        <ResultsSection
          items={results}
          summary={summary}
          jobMode={jobMode}
          violationsOnly={notification?.type === 'violations'}
          onClearViolationsFilter={() => setNotification(null)}
        />
      )}
    </Content>
  );
}
