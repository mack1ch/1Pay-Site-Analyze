import { useState, useRef } from 'react';
import { Card, Tabs, Input, Select, InputNumber, Checkbox, Button, Space, Form, Tooltip, Collapse } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { parseCsvUrls } from './csv';
import type { JobOptions, CrawlOptionsInput, AccessOptions } from './api';

type InputMode = 'list' | 'crawl';

interface InputSectionProps {
  onStart: (mode: 'list' | 'crawl', urls: string[], options: JobOptions) => void;
  loading: boolean;
}

export function InputSection({ onStart, loading }: InputSectionProps) {
  const [inputMode, setInputMode] = useState<InputMode>('list');
  const [rawUrls, setRawUrls] = useState('');
  const [csvUrlFile, setCsvUrlFile] = useState<string | null>(null);
  const [seedUrlsText, setSeedUrlsText] = useState('');
  const [crawlMode, setCrawlMode] = useState<CrawlOptionsInput['crawlMode']>('crawl');
  const [maxPages, setMaxPages] = useState(50);
  const [maxDepth, setMaxDepth] = useState(2);
  const [sameHostOnly, setSameHostOnly] = useState(true);
  const [excludePatterns, setExcludePatterns] = useState('');
  const [includePatterns, setIncludePatterns] = useState('');
  const [useBrowserFetch, setUseBrowserFetch] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [proxyList, setProxyList] = useState('');
  const [userAgentMode, setUserAgentMode] = useState<'default' | 'random' | 'custom'>('default');
  const [userAgentCustom, setUserAgentCustom] = useState('');
  const [acceptLanguage, setAcceptLanguage] = useState('ru-RU,ru;q=0.9,en;q=0.8');
  const [referrerPolicy, setReferrerPolicy] = useState<AccessOptions['referrerPolicy'] | ''>('');
  const [delayMs, setDelayMs] = useState<number | null>(null);
  const [delayMin, setDelayMin] = useState<number | null>(null);
  const [delayMax, setDelayMax] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [locale, setLocale] = useState('');
  const [timezoneId, setTimezoneId] = useState('');
  const [stealthEnabled, setStealthEnabled] = useState(true);
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

  const buildAccessOptions = (): AccessOptions | undefined => {
    const proxies = proxyList
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\//i.test(l) || /^socks/i.test(l));
    const ua =
      userAgentMode === 'random'
        ? 'random'
        : userAgentMode === 'custom' && userAgentCustom.trim()
          ? userAgentCustom.trim()
          : undefined;
    const delay =
      delayMs != null && delayMs > 0
        ? delayMs
        : delayMin != null && delayMax != null && (delayMin > 0 || delayMax > 0)
          ? { min: Math.max(0, delayMin), max: Math.max(delayMin ?? 0, delayMax ?? 0) }
          : undefined;
    const viewport =
      viewportWidth != null && viewportHeight != null && viewportWidth > 0 && viewportHeight > 0
        ? { width: viewportWidth, height: viewportHeight }
        : undefined;
    const defaultAcceptLanguage = 'ru-RU,ru;q=0.9,en;q=0.8';
    const hasCustomAccept = acceptLanguage.trim() && acceptLanguage.trim() !== defaultAcceptLanguage;
    if (
      !proxies.length &&
      !ua &&
      !hasCustomAccept &&
      !referrerPolicy &&
      !delay &&
      !viewport &&
      !locale.trim() &&
      !timezoneId.trim() &&
      stealthEnabled
    ) {
      return undefined;
    }
    const access: AccessOptions = {};
    if (proxies.length) access.proxy = proxies.length === 1 ? proxies[0] : proxies;
    if (ua) access.userAgent = ua;
    if (hasCustomAccept) access.acceptLanguage = acceptLanguage.trim();
    if (referrerPolicy) access.referrerPolicy = referrerPolicy;
    if (delay) access.delayBetweenRequestsMs = delay;
    if (viewport) access.viewport = viewport;
    if (locale.trim()) access.locale = locale.trim();
    if (timezoneId.trim()) access.timezoneId = timezoneId.trim();
    if (!stealthEnabled) access.stealth = false;
    return access;
  };

  const handleStart = () => {
    const access = buildAccessOptions();
    const options: JobOptions = {
      concurrencyFetch: 8,
      concurrencyScreenshots: 2,
      maxChars: 300_000,
      maxResponseBytes: 10_000_000,
      useBrowserFetch,
      screenshot: { enabled: true, fullPage: true },
      ...(access && { access }),
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
      onStart('list', dedupedUrls, options);
    } else {
      const seedUrls = seedUrlsText
        .trim()
        .split(/\n/)
        .map((s) => s.trim())
        .filter((u) => /^https?:\/\//i.test(u));
      if (seedUrls.length === 0) return;
      onStart('crawl', seedUrls, options);
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
          <Form.Item label="Стартовые URL (по одному на строку)" style={{ marginBottom: 0 }}>
            <Input.TextArea
              placeholder="https://example.com&#10;https://other-site.com"
              value={seedUrlsText}
              onChange={(e) => setSeedUrlsText(e.target.value)}
              rows={4}
              disabled={loading}
            />
          </Form.Item>
          <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
            Можно указать несколько сайтов — обход начнётся с каждого URL.
          </span>
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
      <Collapse
        activeKey={accessOpen ? ['access'] : []}
        onChange={(keys) => setAccessOpen(keys.includes('access'))}
        style={{ marginBottom: 16 }}
      >
        <Collapse.Panel
          header="Настройки доступа (анти-бот): прокси, User-Agent, задержки, stealth"
          key="access"
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Form.Item style={{ marginBottom: 0 }}>
              <Space size={4}>
                <Checkbox
                  checked={stealthEnabled}
                  onChange={(e) => setStealthEnabled(e.target.checked)}
                  disabled={loading}
                >
                  Скрывать признаки бота (stealth)
                </Checkbox>
                <Tooltip title="В браузере: скрыть navigator.webdriver, отключить флаги AutomationControlled, добавить заголовки Sec-Fetch-*. Снижает вероятность распознавания автоматизации сайтами.">
                  <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                </Tooltip>
              </Space>
            </Form.Item>
            <Form.Item
              label={
                <Tooltip title="Один или несколько прокси (по одному на строку). Формат: http://host:port или http://user:pass@host:port. Запросы будут распределяться по списку.">
                  <span>Прокси <QuestionCircleOutlined style={{ marginLeft: 4 }} /></span>
                </Tooltip>
              }
              style={{ marginBottom: 0 }}
            >
              <Input.TextArea
                placeholder="http://proxy.example.com:8080&#10;http://user:pass@proxy2:3128"
                value={proxyList}
                onChange={(e) => setProxyList(e.target.value)}
                rows={2}
                disabled={loading}
              />
            </Form.Item>
            <Space wrap align="start">
              <Form.Item label="User-Agent" style={{ marginBottom: 0 }}>
                <Select
                  value={userAgentMode}
                  onChange={setUserAgentMode}
                  style={{ width: 180 }}
                  options={[
                    { value: 'default', label: 'По умолчанию (Chrome)' },
                    { value: 'random', label: 'Случайный (ротация)' },
                    { value: 'custom', label: 'Свой' },
                  ]}
                />
              </Form.Item>
              {userAgentMode === 'custom' && (
                <Form.Item label="Строка User-Agent" style={{ marginBottom: 0 }}>
                  <Input
                    placeholder="Mozilla/5.0 ..."
                    value={userAgentCustom}
                    onChange={(e) => setUserAgentCustom(e.target.value)}
                    style={{ width: 320 }}
                  />
                </Form.Item>
              )}
            </Space>
            <Form.Item
              label={
                <Tooltip title="Заголовок Accept-Language. Влияет на язык контента и меньше выдаёт бота.">
                  <span>Accept-Language <QuestionCircleOutlined style={{ marginLeft: 4 }} /></span>
                </Tooltip>
              }
              style={{ marginBottom: 0 }}
            >
              <Input
                value={acceptLanguage}
                onChange={(e) => setAcceptLanguage(e.target.value)}
                placeholder="ru-RU,ru;q=0.9,en;q=0.8"
                style={{ width: 320 }}
              />
            </Form.Item>
            <Form.Item
              label={
                <Tooltip title="Политика отправки Referer. no-referrer часто используют боты — для маскировки можно origin или strict-origin-when-cross-origin.">
                  <span>Referrer-Policy <QuestionCircleOutlined style={{ marginLeft: 4 }} /></span>
                </Tooltip>
              }
              style={{ marginBottom: 0 }}
            >
              <Select
                value={referrerPolicy || undefined}
                onChange={(v) => setReferrerPolicy(v ?? '')}
                style={{ width: 260 }}
                placeholder="Не задано"
                allowClear
                options={[
                  { value: 'no-referrer', label: 'no-referrer' },
                  { value: 'origin', label: 'origin' },
                  { value: 'strict-origin', label: 'strict-origin' },
                  { value: 'strict-origin-when-cross-origin', label: 'strict-origin-when-cross-origin' },
                  { value: 'unsafe-url', label: 'unsafe-url' },
                ]}
              />
            </Form.Item>
            <Space wrap align="start">
              <Form.Item
                label={
                  <Tooltip title="Пауза между запросами (мс). Снижает вероятность блокировки по частоте.">
                    <span>Задержка (мс) <QuestionCircleOutlined style={{ marginLeft: 4 }} /></span>
                  </Tooltip>
                }
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  min={0}
                  placeholder="Одна величина"
                  value={delayMs ?? undefined}
                  onChange={(v) => setDelayMs(v ?? null)}
                  style={{ width: 100 }}
                />
              </Form.Item>
              <Form.Item label="или мин" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={0}
                  value={delayMin ?? undefined}
                  onChange={(v) => setDelayMin(v ?? null)}
                  style={{ width: 80 }}
                />
              </Form.Item>
              <Form.Item label="макс (мс)" style={{ marginBottom: 0 }}>
                <InputNumber
                  min={0}
                  value={delayMax ?? undefined}
                  onChange={(v) => setDelayMax(v ?? null)}
                  style={{ width: 80 }}
                />
              </Form.Item>
            </Space>
            <Space wrap align="start">
              <Form.Item
                label={
                  <Tooltip title="Размер окна браузера (для скриншотов и загрузки через браузер).">
                    <span>Вьюпорт <QuestionCircleOutlined style={{ marginLeft: 4 }} /></span>
                  </Tooltip>
                }
                style={{ marginBottom: 0 }}
              >
                <Space>
                  <InputNumber
                    min={320}
                    placeholder="ширина"
                    value={viewportWidth ?? undefined}
                    onChange={(v) => setViewportWidth(v ?? null)}
                    style={{ width: 90 }}
                  />
                  <span>×</span>
                  <InputNumber
                    min={240}
                    placeholder="высота"
                    value={viewportHeight ?? undefined}
                    onChange={(v) => setViewportHeight(v ?? null)}
                    style={{ width: 90 }}
                  />
                </Space>
              </Form.Item>
              <Form.Item label="Локаль" style={{ marginBottom: 0 }}>
                <Input
                  placeholder="ru-RU"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  style={{ width: 100 }}
                />
              </Form.Item>
              <Form.Item label="Часовой пояс" style={{ marginBottom: 0 }}>
                <Input
                  placeholder="Europe/Moscow"
                  value={timezoneId}
                  onChange={(e) => setTimezoneId(e.target.value)}
                  style={{ width: 140 }}
                />
              </Form.Item>
            </Space>
          </Space>
        </Collapse.Panel>
      </Collapse>
      <div style={{ marginTop: 0 }}>
        <Button
          type="primary"
          size="large"
          onClick={handleStart}
          loading={loading}
          disabled={
            (inputMode === 'list' && dedupedUrls.length === 0) ||
            (inputMode === 'crawl' &&
              !seedUrlsText
                .trim()
                .split(/\n/)
                .some((u) => /^https?:\/\//i.test(u.trim())))
          }
        >
          {loading ? 'Запуск…' : 'Старт'}
        </Button>
      </div>
    </Card>
  );
}
