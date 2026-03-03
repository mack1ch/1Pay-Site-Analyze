import { useState, useRef } from 'react';
import { Card, Tabs, Input, Select, InputNumber, Checkbox, Button, Space, Form, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { parseCsvUrls } from './csv';
import type { JobOptions, CrawlOptionsInput } from './api';

type InputMode = 'list' | 'crawl';

interface InputSectionProps {
  onStart: (
    mode: 'list' | 'crawl',
    urls: string[],
    seedUrl: string | undefined,
    options: JobOptions
  ) => void;
  loading: boolean;
}

export function InputSection({ onStart, loading }: InputSectionProps) {
  const [inputMode, setInputMode] = useState<InputMode>('list');
  const [rawUrls, setRawUrls] = useState('');
  const [csvUrlFile, setCsvUrlFile] = useState<string | null>(null);
  const [seedUrl, setSeedUrl] = useState('');
  const [crawlMode, setCrawlMode] = useState<CrawlOptionsInput['crawlMode']>('crawl');
  const [maxPages, setMaxPages] = useState(50);
  const [maxDepth, setMaxDepth] = useState(2);
  const [sameHostOnly, setSameHostOnly] = useState(true);
  const [excludePatterns, setExcludePatterns] = useState('');
  const [includePatterns, setIncludePatterns] = useState('');
  const [useBrowserFetch, setUseBrowserFetch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urlList = (() => {
    if (csvUrlFile?.trim()) {
      const fromCsv = parseCsvUrls(csvUrlFile);
      if (fromCsv.length > 0) return fromCsv;
    }
    return rawUrls
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\//i.test(l));
  })();
  const dedupedUrls = [...new Set(urlList)];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvUrlFile(reader.result as string);
    reader.readAsText(file, 'UTF-8');
  };

  const handleStart = () => {
    const options: JobOptions = {
      concurrencyFetch: 8,
      concurrencyScreenshots: 2,
      maxChars: 300_000,
      maxResponseBytes: 10_000_000,
      useBrowserFetch,
      screenshot: { enabled: true, fullPage: true },
      crawl:
        inputMode === 'crawl'
          ? {
              crawlMode,
              maxPages,
              maxDepth,
              sameHostOnly,
              excludePatterns: excludePatterns
                .split(/\n/)
                .map((p) => p.trim())
                .filter(Boolean),
              includePatterns: includePatterns
                .split(/\n/)
                .map((p) => p.trim())
                .filter(Boolean),
            }
          : undefined,
    };
    if (inputMode === 'list') {
      if (dedupedUrls.length === 0) return;
      onStart('list', dedupedUrls, undefined, options);
    } else {
      const url = seedUrl.trim();
      if (!/^https?:\/\//i.test(url)) return;
      onStart('crawl', [url], url, options);
    }
  };

  const tabItems = [
    {
      key: 'list',
      label: 'Список URL',
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Form.Item label="Введите URL (по одному на строку)" style={{ marginBottom: 0 }}>
            <Input.TextArea
              placeholder="https://example.com/page1&#10;https://example.com/page2"
              value={rawUrls}
              onChange={(e) => setRawUrls(e.target.value)}
              rows={5}
              disabled={loading}
            />
          </Form.Item>
          <Space>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              Загрузить URL из CSV
            </Button>
          </Space>
          <span style={{ color: 'var(--ant-color-text-secondary)' }}>
            Загружено: {dedupedUrls.length} URL (без дубликатов)
          </span>
        </Space>
      ),
    },
    {
      key: 'crawl',
      label: 'Обход сайта',
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Form.Item label="Стартовый URL" style={{ marginBottom: 0 }}>
            <Input
              type="url"
              placeholder="https://example.com"
              value={seedUrl}
              onChange={(e) => setSeedUrl(e.target.value)}
              disabled={loading}
            />
          </Form.Item>
          <Space wrap size="middle" align="start">
            <Form.Item
              label={
                <Space size={4}>
                  <span>Режим обхода</span>
                  <Tooltip title="Как собирать страницы: только введённые ссылки, только стартовая страница или полный обход по всем ссылкам на сайте.">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
              style={{ marginBottom: 0 }}
            >
              <Select
                value={crawlMode}
                onChange={(v) => setCrawlMode(v)}
                style={{ width: 280 }}
                options={[
                  { value: 'submitted_only', label: 'Только введённые URL' },
                  { value: 'seed_only', label: 'Только стартовая страница' },
                  { value: 'crawl', label: 'Полный обход по ссылкам' },
                ]}
              />
            </Form.Item>
            <Form.Item
              label={
                <Space size={4}>
                  <span>Макс. страниц</span>
                  <Tooltip title="Сколько страниц максимум обработать при обходе (от 1 до 500).">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                min={1}
                max={500}
                value={maxPages}
                onChange={(v) => setMaxPages(v ?? 50)}
                style={{ width: 100 }}
              />
            </Form.Item>
            <Form.Item
              label={
                <Space size={4}>
                  <span>Глубина</span>
                  <Tooltip title="На сколько «шагов» по ссылкам уходить от стартовой страницы. 0 — только она, 1 — ещё страницы, на которые она ссылается, и т.д.">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                min={0}
                max={5}
                value={maxDepth}
                onChange={(v) => setMaxDepth(v ?? 2)}
                style={{ width: 80 }}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Space size={4}>
                <Checkbox checked={sameHostOnly} onChange={(e) => setSameHostOnly(e.target.checked)}>
                  Только тот же сайт
                </Checkbox>
                <Tooltip title="Не переходить по ссылкам на другие домены — только страницы того же сайта.">
                  <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                </Tooltip>
              </Space>
            </Form.Item>
          </Space>
          <Form.Item
            label={
              <Space size={4}>
                <span>Исключить пути</span>
                <Tooltip title="Адреса или части путей, которые не обрабатывать (например /admin или /logout). По одному на строку.">
                  <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                </Tooltip>
              </Space>
            }
            style={{ marginBottom: 0 }}
          >
            <Input.TextArea
              placeholder="/admin&#10;/logout"
              value={excludePatterns}
              onChange={(e) => setExcludePatterns(e.target.value)}
              rows={2}
            />
          </Form.Item>
          <Form.Item
            label={
              <Space size={4}>
                <span>Только эти пути (необязательно)</span>
                <Tooltip title="Ограничить обход только страницами, подходящими под эти шаблоны. Если пусто — обход по всем ссылкам в пределах лимитов.">
                  <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                </Tooltip>
              </Space>
            }
            style={{ marginBottom: 0 }}
          >
            <Input.TextArea
              value={includePatterns}
              onChange={(e) => setIncludePatterns(e.target.value)}
              rows={2}
            />
          </Form.Item>
          <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
            Учитываются макс. страниц и глубина; «Только тот же хост» не даёт уходить на другие домены.
          </span>
        </Space>
      ),
    },
  ];

  return (
    <Card title="Ввод" style={{ marginBottom: 16 }}>
      <Tabs
        activeKey={inputMode}
        onChange={(k) => setInputMode(k as InputMode)}
        items={tabItems}
      />
      <div style={{ marginTop: 16, marginBottom: 12 }}>
        <Space wrap align="center">
          <Checkbox
            checked={useBrowserFetch}
            onChange={(e) => setUseBrowserFetch(e.target.checked)}
            disabled={loading}
          >
            <Tooltip title="Включать для сайтов, где контент подгружается через JavaScript (SPA): страница открывается в браузере, после отрисовки извлекается весь текст. Подходит для plati.market и подобных.">
              <span>
                Загружать через браузер <QuestionCircleOutlined style={{ marginLeft: 4, color: 'var(--ant-color-text-tertiary)' }} />
              </span>
            </Tooltip>
          </Checkbox>
        </Space>
      </div>
      <div style={{ marginTop: 0 }}>
        <Button
          type="primary"
          size="large"
          onClick={handleStart}
          loading={loading}
          disabled={
            (inputMode === 'list' && dedupedUrls.length === 0) ||
            (inputMode === 'crawl' && !/^https?:\/\//i.test(seedUrl.trim()))
          }
        >
          {loading ? 'Запуск…' : 'Старт'}
        </Button>
      </div>
    </Card>
  );
}
