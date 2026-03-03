import { Tooltip, Card, Progress, Space, Tag, Button } from 'antd';
import type { JobProgress } from './api';

const STATUS_LABELS: Record<string, string> = {
  queued: 'В очереди',
  pending: 'Ожидание',
  running: 'Выполняется',
  done: 'Готово',
  completed: 'Завершено',
  cancelled: 'Отменено',
  failed: 'Ошибка',
};

const TAG_HELP: Record<string, string> = {
  discovered: 'Страниц найдено по ссылкам при обходе сайта.',
  queued: 'Страниц в очереди на обработку.',
  processed: 'Уже обработано (загружено и проверено).',
  failed: 'Страниц, которые не удалось загрузить.',
  violations: 'Страниц, где найдены запрещённые слова.',
};

interface RunControlsProps {
  progress: JobProgress | null;
  onCancel: () => void;
  onReset: () => void;
  isRunning: boolean;
  isDone: boolean;
}

export function RunControls({
  progress,
  onCancel,
  onReset,
  isRunning,
  isDone,
}: RunControlsProps) {
  if (!progress) return null;

  const total = progress.total ?? progress.queued ?? 0;
  const pct = total > 0 ? Math.round((progress.processed / total) * 100) : 0;
  const statusLabel = STATUS_LABELS[progress.status] ?? progress.status;

  const statusColor =
    progress.status === 'running' || progress.status === 'pending' || progress.status === 'queued'
      ? 'processing'
      : progress.status === 'failed' || progress.status === 'cancelled'
        ? 'error'
        : 'success';

  return (
    <Card title="Управление запуском" style={{ marginBottom: 16 }}>
      <Progress percent={pct} status={isRunning ? 'active' : 'success'} style={{ marginBottom: 16 }} />
      <Space wrap size="middle">
        <Tooltip title={TAG_HELP.discovered}>
          <Tag color="blue">Найдено: {progress.discovered ?? 0}</Tag>
        </Tooltip>
        <Tooltip title={TAG_HELP.queued}>
          <Tag color="cyan">В очереди: {progress.queued ?? 0}</Tag>
        </Tooltip>
        <Tooltip title={TAG_HELP.processed}>
          <Tag color="green">Обработано: {progress.processed}</Tag>
        </Tooltip>
        <Tooltip title={TAG_HELP.failed}>
          <Tag color="red">Ошибок: {progress.failed}</Tag>
        </Tooltip>
        <Tooltip title={TAG_HELP.violations}>
          <Tag color="orange">Нарушений: {progress.violations ?? 0}</Tag>
        </Tooltip>
      </Space>
      <div style={{ marginTop: 12 }}>
        <Tag color={statusColor}>{statusLabel}</Tag>
      </div>
      <Space style={{ marginTop: 16 }}>
        {isRunning && (
          <Button danger onClick={onCancel}>
            Отмена
          </Button>
        )}
        {(isDone || progress.status === 'cancelled' || progress.status === 'failed') && (
          <Button onClick={onReset}>Сброс</Button>
        )}
      </Space>
    </Card>
  );
}
