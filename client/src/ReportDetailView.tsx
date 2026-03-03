import { useState, useMemo } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Image,
  List,
  Divider,
  Descriptions,
  Alert,
  Pagination,
} from 'antd';
import { ArrowLeftOutlined, LinkOutlined, PictureOutlined, FileTextOutlined } from '@ant-design/icons';
import type { ResultItem, MatchedTerm } from './api';
import { screenshotFullUrl, SCREENSHOT_PLACEHOLDER } from './api';

interface ReportDetailViewProps {
  item: ResultItem;
  /** Все страницы того же задания — для показа скриншотов со всех страниц в глубоком просмотре */
  allItems?: ResultItem[];
  onClose: () => void;
  onOpenText?: (item: ResultItem) => void;
  onOpenMatches?: (item: ResultItem) => void;
  /** Открыть скриншот текущей страницы в модалке (по клику на превью). */
  onOpenScreenshot?: () => void;
  /** Переключить глубокий просмотр на другую страницу (для обхода по домену). */
  onSelectItem?: (item: ResultItem) => void;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact_substring: 'Точная подстрока',
  word: 'Целое слово',
  smart_stem: 'По основе слова',
  smart_fuzzy: 'С учётом опечаток',
  phrase: 'Фраза',
};

/** Порог в днях: если сертификат выдан недавнее — подсвечиваем как аномально недавний. */
const SSL_RECENT_DAYS = 90;

function isSSLRecentlyIssued(validFromISO: string): boolean {
  const d = new Date(validFromISO);
  if (isNaN(d.getTime())) return false;
  const daysAgo = (Date.now() - d.getTime()) / (24 * 60 * 60 * 1000);
  return daysAgo < SSL_RECENT_DAYS;
}

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ReportDetailView({
  item,
  allItems = [],
  onClose,
  onOpenText,
  onOpenMatches,
  onOpenScreenshot,
  onSelectItem,
}: ReportDetailViewProps) {
  const currentHost = useMemo(() => {
    try {
      return new URL(item.finalUrl || item.url).hostname || '';
    } catch {
      return '';
    }
  }, [item.finalUrl, item.url]);

  const domainItems = useMemo(
    () =>
      currentHost
        ? allItems.filter((r) => {
            try {
              return new URL(r.finalUrl || r.url).hostname === currentHost;
            } catch {
              return false;
            }
          })
        : [],
    [allItems, currentHost]
  );

  const itemsWithScreenshots = useMemo(
    () => allItems.filter((r) => r.screenshotUrl && r.url !== item.url),
    [allItems, item.url]
  );
  const [screenshotsPage, setScreenshotsPage] = useState(1);
  const SCREENSHOTS_PAGE_SIZE = 8;
  const paginatedScreenshots = useMemo(() => {
    const start = (screenshotsPage - 1) * SCREENSHOTS_PAGE_SIZE;
    return itemsWithScreenshots.slice(start, start + SCREENSHOTS_PAGE_SIZE);
  }, [itemsWithScreenshots, screenshotsPage]);
  const handleDownloadText = () => {
    if (item.title ?? item.text)
      download('text.txt', 'text/plain', (item.title ?? '') + '\n\n' + (item.text ?? ''));
  };
  const scan = item.forbiddenScan;
  const hasViolations = scan?.hasMatches ?? false;

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onClose}>
          На главную
        </Button>
      </Space>

      {domainItems.length > 1 && (
        <Card
          title={`Обход домена: ${currentHost}`}
          style={{ marginBottom: 16 }}
          extra={
            <Typography.Text type="secondary">
              {domainItems.length} страниц
            </Typography.Text>
          }
        >
          <List
            size="small"
            dataSource={domainItems}
            renderItem={(r) => {
              const isCurrent = r.url === item.url && (r.finalUrl || r.url) === (item.finalUrl || item.url);
              const hasV = r.forbiddenScan?.hasMatches ?? false;
              return (
                <List.Item
                  key={r.finalUrl || r.url}
                  style={{ cursor: onSelectItem ? 'pointer' : undefined }}
                  onClick={() => onSelectItem?.(r)}
                  actions={
                    onSelectItem && !isCurrent
                      ? [
                          <Button type="link" size="small" key="open">
                            Открыть
                          </Button>,
                        ]
                      : undefined
                  }
                >
                  <List.Item.Meta
                    title={
                      <Space size={8}>
                        {isCurrent && <Tag color="blue">Текущая</Tag>}
                        {hasV && <Tag color="orange">Нарушения</Tag>}
                        <Typography.Text ellipsis style={{ maxWidth: 400 }}>
                          {r.title || r.finalUrl || r.url}
                        </Typography.Text>
                      </Space>
                    }
                    description={
                      <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                        {r.finalUrl || r.url}
                      </Typography.Text>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      )}

      <Card title="Детальный отчёт по странице" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 1, md: 2 }} bordered size="small">
          <Descriptions.Item label="URL" span={2}>
            <Typography.Link href={item.url} target="_blank" rel="noopener noreferrer" copyable>
              {item.finalUrl || item.url}
            </Typography.Link>
          </Descriptions.Item>
          <Descriptions.Item label="Заголовок страницы">
            {item.title ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Статус">
            {item.blockedBySite ? (
              <Tag color="warning">Сайт заблокировал доступ</Tag>
            ) : (
              <Tag color={item.ok ? 'success' : 'error'}>
                {item.ok ? (item.truncated ? 'OK (текст обрезан)' : 'OK') : 'Ошибка загрузки'}
              </Tag>
            )}
            {item.statusCode != null && ` (${item.statusCode})`}
          </Descriptions.Item>
          <Descriptions.Item label="Длина текста">
            {item.textLength != null
              ? `${item.textLength} символов${item.truncated ? ' (обрезано)' : ''}`
              : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Нарушения">
            {hasViolations ? (
              <Tag color="orange">
                Найдено: {scan!.matchedTerms.length} терминов, {scan!.totalMatches} совпадений
              </Tag>
            ) : (
              <Tag color="green">Нет нарушений</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="SSL: дата выдачи">
            {item.sslValidFrom ? (
              <span>
                {item.sslValidFrom}
                {item.sslValidTo && ` — действует до ${item.sslValidTo}`}
                {isSSLRecentlyIssued(item.sslValidFrom) && (
                  <Tag color="warning" style={{ marginLeft: 8 }}>
                    Сертификат выдан недавно (менее {SSL_RECENT_DAYS} дн.)
                  </Tag>
                )}
              </span>
            ) : (
              '—'
            )}
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">Действия</Divider>
        <Space wrap size="middle">
          {item.ok && item.text && onOpenText && (
            <Button icon={<FileTextOutlined />} onClick={() => onOpenText(item)}>
              Показать текст страницы
            </Button>
          )}
          {hasViolations && onOpenMatches && (
            <Button type="primary" onClick={() => onOpenMatches(item)}>
              Подробнее о совпадениях
            </Button>
          )}
          {item.ok && item.text && (
            <Button onClick={handleDownloadText}>Скачать текст (.txt)</Button>
          )}
          <Button
            icon={<LinkOutlined />}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть страницу
          </Button>
          {item.screenshotUrl && (
            <Button
              icon={<PictureOutlined />}
              href={screenshotFullUrl(item.screenshotUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть скриншот
            </Button>
          )}
        </Space>
      </Card>

      {item.screenshotUrl ? (
        <Card
          title={
            <span>
              Скриншот этой страницы
              {hasViolations && (
                <Tag color="error" style={{ marginLeft: 8 }}>
                  На скриншоте отмечены найденные запрещённые слова
                </Tag>
              )}
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          {onOpenScreenshot ? (
            <>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenScreenshot()}
                onKeyDown={(e) => e.key === 'Enter' && onOpenScreenshot()}
                style={{
                  display: 'inline-block',
                  cursor: 'pointer',
                  borderRadius: 8,
                  border: hasViolations ? '3px solid #ff4d4f' : '1px solid #f0f0f0',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  boxShadow: hasViolations ? '0 0 0 1px rgba(255, 77, 79, 0.5)' : undefined,
                }}
              >
                <Image
                  src={screenshotFullUrl(item.screenshotUrl)}
                  alt="Скриншот"
                  fallback={SCREENSHOT_PLACEHOLDER}
                  style={{
                    width: 240,
                    height: 150,
                    objectFit: 'cover',
                    borderRadius: 6,
                    display: 'block',
                  }}
                />
              </div>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Нажмите на превью, чтобы открыть скриншот в полном размере
              </Typography.Text>
            </>
          ) : (
            <a
              href={screenshotFullUrl(item.screenshotUrl)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block' }}
            >
              <Image
                src={screenshotFullUrl(item.screenshotUrl)}
                alt="Скриншот"
                fallback={SCREENSHOT_PLACEHOLDER}
                style={{
                  width: 240,
                  height: 150,
                  objectFit: 'cover',
                  borderRadius: 6,
                  border: hasViolations ? '3px solid #ff4d4f' : undefined,
                  display: 'block',
                  boxShadow: hasViolations ? '0 0 0 1px rgba(255, 77, 79, 0.5)' : undefined,
                }}
              />
            </a>
          )}
        </Card>
      ) : item.ok ? (
        <Alert
          type="info"
          showIcon
          message="Скриншот недоступен"
          description="Скриншот для этой страницы не был создан (таймаут или ошибка при съёмке). Проверьте логи сервера."
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {itemsWithScreenshots.length > 0 && (
        <Card
          title={`Скриншоты остальных страниц (${itemsWithScreenshots.length})`}
          style={{ marginBottom: 16 }}
        >
          <List
            grid={{
              xs: 1,
              sm: 2,
              md: 3,
              lg: 4,
            }}
            dataSource={paginatedScreenshots}
            renderItem={(r) => {
              const hasViolations = r.forbiddenScan?.hasMatches ?? false;
              return (
                <List.Item key={r.url}>
                  <a
                    href={screenshotFullUrl(r.screenshotUrl!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', position: 'relative' }}
                  >
                    <Image
                      src={screenshotFullUrl(r.screenshotUrl!)}
                      alt={r.title ?? r.finalUrl ?? r.url}
                      fallback={SCREENSHOT_PLACEHOLDER}
                      style={{
                        width: '100%',
                        aspectRatio: '16/10',
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: hasViolations ? '3px solid #ff4d4f' : undefined,
                        boxSizing: 'border-box',
                        boxShadow: hasViolations ? '0 0 0 1px rgba(255, 77, 79, 0.5)' : undefined,
                      }}
                    />
                    {hasViolations && (
                      <Tag
                        color="error"
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          margin: 0,
                          fontSize: 10,
                        }}
                      >
                        Нарушения
                      </Tag>
                    )}
                    <Typography.Text
                      type="secondary"
                      ellipsis
                      style={{ display: 'block', marginTop: 4, fontSize: 12 }}
                    >
                      {r.title || r.finalUrl || r.url}
                    </Typography.Text>
                  </a>
                </List.Item>
              );
            }}
          />
          {itemsWithScreenshots.length > SCREENSHOTS_PAGE_SIZE && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Pagination
                current={screenshotsPage}
                total={itemsWithScreenshots.length}
                pageSize={SCREENSHOTS_PAGE_SIZE}
                showSizeChanger={false}
                onChange={setScreenshotsPage}
                showTotal={(total) => `Всего ${total} скриншотов`}
              />
            </div>
          )}
        </Card>
      )}

      {hasViolations && scan && (
        <Card
          title={
            <span>
              Где и что найдено — нарушений: {scan.totalMatches} по {scan.matchedTerms.length} терминам
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <List
            dataSource={scan.matchedTerms}
            renderItem={(m: MatchedTerm, i: number) => (
              <List.Item
                key={i}
                extra={
                  <Space wrap size="small">
                    <Tag>{MATCH_TYPE_LABELS[m.matchType] ?? m.matchType}</Tag>
                    <Tag color="blue">×{m.count}</Tag>
                  </Space>
                }
              >
                <div style={{ flex: 1, width: '100%', minWidth: 200 }}>
                  <List.Item.Meta
                    title={<strong>Слово/фраза: «{m.term}»</strong>}
                    description={
                      m.normalizedTerm ? (
                        <Typography.Text type="secondary">Нормальная форма: {m.normalizedTerm}</Typography.Text>
                      ) : null
                    }
                  />
                  {m.snippets?.length ? (
                    <div style={{ marginTop: 8, width: '100%' }}>
                      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                        Фрагменты в тексте:
                      </Typography.Text>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                        {m.snippets.map((s, j) => (
                          <li key={j} style={{ marginBottom: 4 }}>
                            … {s.snippet} …
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </List.Item>
            )}
          />
        </Card>
      )}

      {item.blockedBySite && (
        <Alert
          type="warning"
          showIcon
          message="Сайт заблокировал доступ"
          description={
            <>
              Страница не была проанализирована: сайт вернул код {item.statusCode} и, вероятно, распознал автоматический доступ (бот).
              {item.note && (
                <div style={{ marginTop: 8 }}>{item.note}</div>
              )}
              {item.error && (
                <div style={{ marginTop: 4, fontWeight: 500 }}>{item.error}</div>
              )}
            </>
          }
          style={{ marginTop: 16 }}
        />
      )}
      {!item.ok && item.error && !item.blockedBySite && (
        <Alert type="error" message="Ошибка" description={item.error} showIcon style={{ marginTop: 16 }} />
      )}
    </div>
  );
}
