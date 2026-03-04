import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, List, Typography, Tag, Button, Spin, Alert, Collapse } from 'antd';
import { HistoryOutlined, FileTextOutlined, SyncOutlined } from '@ant-design/icons';
import { getHistoryDomains, getHistoryReports, getRecentReports, getSchedules, type DomainHistoryItem, type StoredReportMeta, type RecentReportMeta } from './api';

/** Форматирование даты в московском времени. */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<DomainHistoryItem[]>([]);
  const [recentReports, setRecentReports] = useState<RecentReportMeta[]>([]);
  const [runningJobs, setRunningJobs] = useState<Array<{ scheduleName: string; jobId: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportsByDomain, setReportsByDomain] = useState<Record<string, StoredReportMeta[]>>({});
  const [loadingDomain, setLoadingDomain] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getHistoryDomains(), getRecentReports(100), getSchedules()])
      .then(([{ domains: list }, { reports: recent }, { schedules }]) => {
        if (!cancelled) {
          setDomains(list);
          setRecentReports(recent);
          const running = schedules
            .filter((s) => s.runningJobId)
            .map((s) => ({ scheduleName: s.name || 'Без названия', jobId: s.runningJobId! }));
          setRunningJobs(running);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReports = (domain: string) => {
    if (reportsByDomain[domain]) return;
    setLoadingDomain(domain);
    getHistoryReports(domain)
      .then(({ reports }) => {
        setReportsByDomain((prev) => ({ ...prev, [domain]: reports }));
      })
      .finally(() => setLoadingDomain(null));
  };

  const openReport = (jobId: string) => {
    navigate(`/?jobId=${encodeURIComponent(jobId)}`);
  };

  /** Строка лога для отчёта: началась — завершена. */
  function reportLogLine(r: StoredReportMeta): string {
    const start = formatDate(r.createdAt);
    if (r.finishedAt != null) {
      return `Проверка началась ${start}, завершена ${formatDate(r.finishedAt)}`;
    }
    return `Проверка началась ${start}, в процессе…`;
  }

  const onCollapseChange = (keys: string | string[]) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    arr.forEach((key) => {
      if (key && !reportsByDomain[key]) loadReports(key);
    });
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" tip="Загрузка истории…" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="warning"
        message="История проверок недоступна"
        description={
          <>
            {error}
            <div style={{ marginTop: 8 }}>
              Убедитесь, что сервер настроен с PostgreSQL (переменная DATABASE_URL) и таблицы созданы.
            </div>
          </>
        }
        showIcon
        style={{ margin: 24 }}
      />
    );
  }

  if (domains.length === 0 && recentReports.length === 0) {
    return (
      <Card style={{ margin: 24 }}>
        <Typography.Paragraph type="secondary">
          <HistoryOutlined style={{ marginRight: 8 }} />
          Пока нет сохранённой истории проверок. Запустите проверку на главной странице — завершённые отчёты
          будут сохраняться здесь (при подключённой БД).
        </Typography.Paragraph>
      </Card>
    );
  }

  const collapseItems = domains.map((d) => ({
    key: d.domain,
    label: (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Typography.Text strong>{d.domain}</Typography.Text>
        <Tag color="blue">{d.reportCount} отчётов</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Последняя проверка: {formatDate(d.lastCheckedAt)}
        </Typography.Text>
      </span>
    ),
    children: (
      <div style={{ padding: '8px 0' }}>
        {loadingDomain === d.domain ? (
          <Spin tip="Загрузка отчётов…" />
        ) : (
          <List
            size="small"
            dataSource={reportsByDomain[d.domain] ?? []}
            loading={loadingDomain === d.domain}
            locale={{ emptyText: 'Нажмите, чтобы загрузить отчёты' }}
            renderItem={(r) => (
              <List.Item
                key={r.jobId}
                actions={[
                  <Button
                    type="link"
                    size="small"
                    icon={<FileTextOutlined />}
                    onClick={() => openReport(r.jobId)}
                  >
                    Открыть отчёт
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {formatDate(r.createdAt)}
                      <Tag style={{ marginLeft: 8 }}>{r.mode === 'crawl' ? 'Обход' : 'Список'}</Tag>
                      {r.finishedAt == null && <Tag color="processing" icon={<SyncOutlined spin />}>В процессе</Tag>}
                    </span>
                  }
                  description={
                    <>
                      <div style={{ marginBottom: 4 }}>{reportLogLine(r)}</div>
                      {r.summary && (
                        <>
                          Страниц: {r.summary.pagesProcessed ?? '—'}
                          {r.summary.pagesWithViolations != null && (
                            <span style={{ marginLeft: 12 }}>
                              С нарушениями: <Tag color="orange">{r.summary.pagesWithViolations}</Tag>
                            </span>
                          )}
                        </>
                      )}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    ),
  }));

  return (
    <Card title="История проверок" style={{ margin: 24 }}>
      <Typography.Paragraph type="secondary">
        Показаны все сохранённые проверки (общие для всех). Сайты и отчёты хранятся в PostgreSQL.
      </Typography.Paragraph>
      {recentReports.length > 0 && (
        <Collapse
          defaultActiveKey={['recent']}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'recent',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Typography.Text strong>Последние проверки (все)</Typography.Text>
                  <Tag color="blue">{recentReports.length} отчётов</Tag>
                </span>
              ),
              children: (
                <List
                  size="small"
                  dataSource={recentReports}
                  renderItem={(r) => (
                    <List.Item
                      key={r.jobId}
                      actions={[
                        <Button
                          type="link"
                          size="small"
                          icon={<FileTextOutlined />}
                          onClick={() => openReport(r.jobId)}
                        >
                          Открыть отчёт
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <span>
                            {r.domain && <Typography.Text type="secondary">{r.domain} — </Typography.Text>}
                            {formatDate(r.createdAt)}
                            <Tag style={{ marginLeft: 8 }}>{r.mode === 'crawl' ? 'Обход' : 'Список'}</Tag>
                            {r.finishedAt == null && <Tag color="processing" icon={<SyncOutlined spin />}>В процессе</Tag>}
                          </span>
                        }
                        description={
                          <>
                            <div style={{ marginBottom: 4 }}>{reportLogLine(r)}</div>
                            {r.summary && (
                              <>
                                Страниц: {r.summary.pagesProcessed ?? '—'}
                                {r.summary.pagesWithViolations != null && (
                                  <span style={{ marginLeft: 12 }}>
                                    С нарушениями: <Tag color="orange">{r.summary.pagesWithViolations}</Tag>
                                  </span>
                                )}
                              </>
                            )}
                          </>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      )}
      {runningJobs.length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<SyncOutlined spin />}
          message="Сейчас выполняется"
          description={
            <List
              size="small"
              dataSource={runningJobs}
              renderItem={({ scheduleName, jobId }) => (
                <List.Item>
                  <span>{scheduleName}</span>
                  <Button type="link" size="small" onClick={() => openReport(jobId)}>
                    Открыть отчёт
                  </Button>
                </List.Item>
              )}
            />
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Collapse items={collapseItems} onChange={onCollapseChange} />
    </Card>
  );
}
