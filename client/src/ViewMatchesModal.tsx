import { Modal, List, Tag, Image, Typography, Space } from 'antd';
import type { ResultItem, MatchedTerm } from './api';
import { screenshotFullUrl, SCREENSHOT_PLACEHOLDER } from './api';

interface ViewMatchesModalProps {
  item: ResultItem;
  onClose: () => void;
}

export function ViewMatchesModal({ item, onClose }: ViewMatchesModalProps) {
  const scan = item.forbiddenScan;
  if (!scan?.matchedTerms?.length) return null;

  return (
    <Modal
      title={`Совпадения — ${item.title || item.url}`}
      open
      onCancel={onClose}
      footer={null}
      width={640}
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      <Typography.Link
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', marginBottom: 16 }}
      >
        {item.finalUrl || item.url}
      </Typography.Link>
      {item.screenshotUrl && (
        <a
          href={screenshotFullUrl(item.screenshotUrl)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', marginBottom: 16, position: 'relative' }}
        >
          <Image
            src={screenshotFullUrl(item.screenshotUrl)}
            alt="Скриншот"
            fallback={SCREENSHOT_PLACEHOLDER}
            width={120}
            style={{
              objectFit: 'cover',
              borderRadius: 4,
              border: scan?.hasMatches ? '3px solid #ff4d4f' : undefined,
              boxShadow: scan?.hasMatches ? '0 0 0 1px rgba(255, 77, 79, 0.5)' : undefined,
              boxSizing: 'border-box',
            }}
          />
          {scan?.hasMatches && (
            <Tag
              color="error"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                margin: 0,
                fontSize: 10,
                lineHeight: 1.2,
              }}
            >
              Нарушения
            </Tag>
          )}
        </a>
      )}
      <List
        dataSource={scan.matchedTerms}
        renderItem={(m: MatchedTerm, i: number) => (
          <List.Item
            key={i}
            extra={
              <Space>
                <Tag>{m.matchType}</Tag>
                {m.normalizedTerm && (
                  <Typography.Text type="secondary">основа: {m.normalizedTerm}</Typography.Text>
                )}
                <Tag color="blue">×{m.count}</Tag>
              </Space>
            }
          >
            <List.Item.Meta title={m.term} />
            {m.snippets?.length ? (
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12 }}>
                {m.snippets.map((s, j) => (
                  <li key={j} style={{ marginBottom: 4 }}>
                    … {s.snippet} …
                  </li>
                ))}
              </ul>
            ) : null}
          </List.Item>
        )}
      />
    </Modal>
  );
}
