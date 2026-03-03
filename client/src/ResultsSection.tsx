import { useState, useMemo, useEffect } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Checkbox,
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { QuestionCircleOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { ResultItem, JobSummary } from './api';
import { screenshotFullUrl, SCREENSHOT_PLACEHOLDER } from './api';
import { TextModal } from './TextModal';
import { ScreenshotModal } from './ScreenshotModal';
import { ViewMatchesModal } from './ViewMatchesModal';
import { ReportDetailView } from './ReportDetailView';
import type { ColumnsType } from 'antd/es/table';

const FILTER_HELP = {
  violationsOnly: 'Оставить в таблице только страницы, где найдены запрещённые слова.',
  search: 'Поиск по адресу страницы, заголовку или по найденному слову.',
  status: 'Показать все страницы, только успешно загруженные (OK) или только с ошибкой загрузки.',
} as const;

interface ResultsSectionProps {
  items: ResultItem[];
  summary?: JobSummary | null;
  /** Режим задания: при 'crawl' результаты группируются по домену с кнопкой «Показать страницы». */
  jobMode?: 'list' | 'crawl' | null;
  violationsOnly?: boolean;
  onClearViolationsFilter?: () => void;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

interface DomainGroup {
  domain: string;
  items: ResultItem[];
  hasViolations: boolean;
}

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function ResultsSection({
  items,
  summary,
  jobMode = null,
  violationsOnly = false,
  onClearViolationsFilter,
}: ResultsSectionProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'ok' | 'failed'>('all');
  const [violationsOnlyFilter, setViolationsOnlyFilter] = useState(violationsOnly);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (violationsOnly) setViolationsOnlyFilter(true);
  }, [violationsOnly]);
  const [textModal, setTextModal] = useState<ResultItem | null>(null);
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null);
  const [matchesModal, setMatchesModal] = useState<ResultItem | null>(null);
  const [detailItem, setDetailItem] = useState<ResultItem | null>(null);

  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus === 'ok') list = list.filter((r) => r.ok);
    if (filterStatus === 'failed') list = list.filter((r) => !r.ok);
    if (violationsOnlyFilter) list = list.filter((r) => r.forbiddenScan?.hasMatches);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.title?.toLowerCase().includes(q) ||
          r.text?.toLowerCase().includes(q) ||
          r.url.toLowerCase().includes(q) ||
          r.forbiddenScan?.matchedTerms?.some((m) => m.term.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, filterStatus, violationsOnlyFilter, search]);

  const domainGroups = useMemo((): DomainGroup[] => {
    if (jobMode !== 'crawl' || filtered.length === 0) return [];
    const byDomain = new Map<string, ResultItem[]>();
    for (const r of filtered) {
      const host = getHostname(r.finalUrl || r.url);
      if (!host) continue;
      if (!byDomain.has(host)) byDomain.set(host, []);
      byDomain.get(host)!.push(r);
    }
    return Array.from(byDomain.entries()).map(([domain, items]) => ({
      domain,
      items,
      hasViolations: items.some((i) => i.forbiddenScan?.hasMatches),
    }));
  }, [jobMode, filtered]);

  const exportJsonl = () => {
    const lines = items.map((r) => JSON.stringify(r)).join('\n');
    download('results.jsonl', 'application/jsonl', lines);
  };

  const exportCsv = () => {
    const header =
      'url,title,textLength,truncated,ok,statusCode,blockedBySite,screenshotUrl,sslValidFrom,sslValidTo,hasMatches,totalMatches,termsFound\n';
    const rows = items.map((r) =>
      [
        escapeCsv(r.url),
        escapeCsv(r.title ?? ''),
        String(r.textLength ?? ''),
        String(r.truncated ?? false),
        String(r.ok),
        String(r.statusCode ?? ''),
        String(r.blockedBySite ?? false),
        escapeCsv(r.screenshotUrl ?? ''),
        escapeCsv(r.sslValidFrom ?? ''),
        escapeCsv(r.sslValidTo ?? ''),
        String(r.forbiddenScan?.hasMatches ?? false),
        String(r.forbiddenScan?.totalMatches ?? 0),
        escapeCsv(
          JSON.stringify(r.forbiddenScan?.matchedTerms?.map((m) => m.term) ?? [])
        ),
      ].join(',')
    );
    download('results.csv', 'text/csv', '\uFEFF' + header + rows.join('\n'));
  };

  const exportViolationsCsv = () => {
    const header = 'url,term,matchType,count,screenshotUrl\n';
    const rows: string[] = [];
    for (const r of items) {
      if (!r.forbiddenScan?.hasMatches) continue;
      for (const m of r.forbiddenScan.matchedTerms) {
        rows.push(
          [
            escapeCsv(r.url),
            escapeCsv(m.term),
            m.matchType,
            String(m.count),
            escapeCsv(r.screenshotUrl ?? ''),
          ].join(',')
        );
      }
    }
    download('violations-report.csv', 'text/csv', '\uFEFF' + header + rows.join('\n'));
  };

  const pagesWithViolations = items.filter((r) => r.forbiddenScan?.hasMatches).length;

  const domainColumns: ColumnsType<DomainGroup> = [
    {
      title: 'Домен',
      dataIndex: 'domain',
      key: 'domain',
      width: 260,
      render: (domain: string) => (
        <Typography.Text strong copyable>
          {domain}
        </Typography.Text>
      ),
    },
    {
      title: 'Статус по домену',
      key: 'domainStatus',
      width: 160,
      render: (_, row: DomainGroup) =>
        row.hasViolations ? (
          <Tag color="orange">Есть нарушения</Tag>
        ) : (
          <Tag color="green">Нарушений нет</Tag>
        ),
    },
    {
      title: 'Страниц',
      key: 'count',
      width: 90,
      render: (_, row: DomainGroup) => row.items.length,
    },
    {
      title: '',
      key: 'expand',
      width: 48,
      render: () => (
        <Tooltip title="Показать все страницы домена">
          <UnorderedListOutlined style={{ color: 'var(--ant-color-primary)' }} />
        </Tooltip>
      ),
    },
  ];

  const columns: ColumnsType<ResultItem> = [
    {
      title: 'URL сайта',
      dataIndex: 'finalUrl',
      key: 'url',
      ellipsis: true,
      width: 220,
      render: (_, row) => (
        <a href={row.url} target="_blank" rel="noopener noreferrer" title={row.url} onClick={(e) => e.stopPropagation()}>
          {row.finalUrl || row.url}
        </a>
      ),
    },
    {
      title: 'Скриншот',
      dataIndex: 'screenshotUrl',
      key: 'screenshot',
      width: 100,
      render: (url: string | undefined, row) => {
        if (!url) return '—';
        const hasViolations = row.forbiddenScan?.hasMatches ?? false;
        return (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <Button
              type="link"
              style={{ padding: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                setScreenshotModal(url);
              }}
            >
              <img
                src={screenshotFullUrl(url)}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).src = SCREENSHOT_PLACEHOLDER;
                }}
                style={{
                  width: 80,
                  height: 50,
                  objectFit: 'cover',
                  borderRadius: 4,
                  border: hasViolations ? '3px solid #ff4d4f' : undefined,
                  boxSizing: 'border-box',
                  boxShadow: hasViolations ? '0 0 0 1px rgba(255, 77, 79, 0.5)' : undefined,
                }}
              />
            </Button>
            {hasViolations && (
              <Tag
                color="error"
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 2,
                  margin: 0,
                  fontSize: 10,
                  lineHeight: 1.2,
                }}
              >
                Нарушения
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: 'Нарушения',
      key: 'violations',
      width: 200,
      render: (_, row) => {
        if (!row.forbiddenScan?.hasMatches) return '—';
        const { matchedTerms, totalMatches } = row.forbiddenScan;
        return (
          <div>
            <div style={{ marginBottom: 4 }}>
              <Tag color="orange">всего совпадений: {totalMatches}</Tag>
            </div>
            <Space size={[4, 4]} wrap>
              {matchedTerms.map((m, i) => (
                <Tag key={i} color="volcano">
                  {m.term} (×{m.count})
                </Tag>
              ))}
            </Space>
          </div>
        );
      },
    },
    {
      title: 'Статус',
      key: 'status',
      width: 140,
      render: (_, row) => (
        <Space size={4} wrap>
          {row.blockedBySite ? (
            <Tag color="warning" title={`Код: ${row.statusCode ?? ''}. Сайт заблокировал доступ.`}>
              Заблокировано
            </Tag>
          ) : (
            <Tag color={row.ok ? 'success' : 'error'}>
              {row.ok ? (row.truncated ? 'OK (обр.)' : 'OK') : 'Ошибка'}
            </Tag>
          )}
          {row.statusCode != null && (
            <Typography.Text type="secondary">{row.statusCode}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Длина текста',
      key: 'textLength',
      width: 100,
      render: (_, row) =>
        row.textLength != null ? `${row.textLength}${row.truncated ? ' (обр.)' : ''}` : '—',
    },
  ];

  if (detailItem) {
    return (
      <>
        <ReportDetailView
          item={detailItem}
          allItems={items}
          onClose={() => setDetailItem(null)}
          onOpenText={(item) => {
            setDetailItem(null);
            setTextModal(item);
          }}
          onOpenMatches={(item) => {
            setDetailItem(null);
            setMatchesModal(item);
          }}
          onOpenScreenshot={
            detailItem.screenshotUrl
              ? () => setScreenshotModal(detailItem.screenshotUrl!)
              : undefined
          }
          onSelectItem={setDetailItem}
        />
        {textModal && <TextModal item={textModal} onClose={() => setTextModal(null)} />}
        {matchesModal && <ViewMatchesModal item={matchesModal} onClose={() => setMatchesModal(null)} />}
        {screenshotModal && (
          <ScreenshotModal url={screenshotFullUrl(screenshotModal)} onClose={() => setScreenshotModal(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <Card title="Результаты" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap align="center">
            <Space size={4}>
              <Checkbox
                checked={violationsOnlyFilter}
                onChange={(e) => setViolationsOnlyFilter(e.target.checked)}
              >
                Только нарушения
              </Checkbox>
              <Tooltip title={FILTER_HELP.violationsOnly}>
                <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
              </Tooltip>
            </Space>
            <Space size={4}>
              <Input.Search
                placeholder="Поиск по URL, заголовку или термину..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                style={{ width: 320 }}
              />
              <Tooltip title={FILTER_HELP.search}>
                <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
              </Tooltip>
            </Space>
            <Space size={4}>
              <Select
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 160 }}
                options={[
                  { value: 'all', label: 'Статус: все' },
                  { value: 'ok', label: 'Только OK' },
                  { value: 'failed', label: 'Только ошибки' },
                ]}
              />
              <Tooltip title={FILTER_HELP.status}>
                <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
              </Tooltip>
            </Space>
            {onClearViolationsFilter && violationsOnlyFilter && (
              <Button onClick={onClearViolationsFilter}>Сбросить фильтр</Button>
            )}
          </Space>

          <Card type="inner" title="Сводка по нарушениям" size="small">
            <p style={{ marginBottom: 8 }}>Страниц с нарушениями: {pagesWithViolations}</p>
            {summary?.topTerms?.length ? (
              <div style={{ marginBottom: 8 }}>
                <Typography.Text strong>Частые термины:</Typography.Text>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                  {summary.topTerms.slice(0, 10).map((t, i) => (
                    <li key={i}>
                      {t.term}: {t.count}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Tooltip title="Скачать отчёт по нарушениям в формате CSV">
              <Button size="small" onClick={exportViolationsCsv}>
                Экспорт отчёта по нарушениям (CSV)
              </Button>
            </Tooltip>
          </Card>

          <Space>
            <Tooltip title="Скачать все результаты в формате JSONL">
              <Button onClick={exportJsonl}>Экспорт JSONL</Button>
            </Tooltip>
            <Tooltip title="Скачать все результаты в формате CSV">
              <Button onClick={exportCsv}>Экспорт CSV</Button>
            </Tooltip>
          </Space>

          {jobMode === 'crawl' && domainGroups.length > 0 ? (
            <Table<DomainGroup>
              dataSource={domainGroups}
              rowKey="domain"
              columns={domainColumns}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Доменов: ${t}` }}
              size="small"
              scroll={{ x: 600 }}
              expandable={{
                expandedRowRender: (record) => (
                  <Table
                    size="small"
                    dataSource={record.items}
                    rowKey={(r) => r.finalUrl || r.url}
                    pagination={false}
                    columns={[
                      {
                        title: 'URL страницы',
                        dataIndex: 'finalUrl',
                        key: 'url',
                        ellipsis: true,
                        render: (_, row) => row.finalUrl || row.url,
                      },
                      {
                        title: 'Статус',
                        key: 'status',
                        width: 100,
                        render: (_, row) => (
                          <Tag color={row.ok ? 'success' : 'error'}>
                            {row.ok ? 'OK' : 'Ошибка'}
                            {row.statusCode != null && ` (${row.statusCode})`}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Нарушения',
                        key: 'violations',
                        width: 120,
                        render: (_, row) =>
                          row.forbiddenScan?.hasMatches ? (
                            <Tag color="orange">
                              {row.forbiddenScan.totalMatches} совпадений
                            </Tag>
                          ) : (
                            '—'
                          ),
                      },
                      {
                        title: '',
                        key: 'action',
                        width: 100,
                        render: (_, row) => (
                          <Button
                            type="link"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailItem(row);
                            }}
                          >
                            Подробнее
                          </Button>
                        ),
                      },
                    ]}
                  />
                ),
                rowExpandable: (record) => record.items.length > 0,
              }}
            />
          ) : (
            <Table
              dataSource={filtered}
              rowKey={(_, i) => String(i)}
              columns={columns}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
              size="small"
              scroll={{ x: 800 }}
              onRow={(record) => ({
                onClick: () => setDetailItem(record),
                style: { cursor: 'pointer' },
              })}
            />
          )}
        </Space>
      </Card>

      {textModal && (
        <TextModal item={textModal} onClose={() => setTextModal(null)} />
      )}
      {screenshotModal && (
        <ScreenshotModal
          url={screenshotFullUrl(screenshotModal)}
          onClose={() => setScreenshotModal(null)}
        />
      )}
      {matchesModal && (
        <ViewMatchesModal item={matchesModal} onClose={() => setMatchesModal(null)} />
      )}
    </>
  );
}
