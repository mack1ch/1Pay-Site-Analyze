import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  message,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, LinkOutlined } from '@ant-design/icons';
import type { Schedule, ScheduleCreate, ScheduleRunLogEntry } from './api';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from './api';

/** Форматирование даты в московском времени. */
function formatDate(ts: number | null): string {
  if (ts == null) return '—';
  return new Date(ts).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLogEvent(event: ScheduleRunLogEntry['event']): string {
  switch (event) {
    case 'started':
      return 'Проверка началась';
    case 'finished':
      return 'Проверка завершена';
    case 'failed':
      return 'Проверка завершилась с ошибкой';
    default:
      return event;
  }
}

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const { schedules: list } = await getSchedules();
      setSchedules(list);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields();
      const body: ScheduleCreate = {
        name: v.name || '',
        mode: v.mode,
        seedUrls:
          v.mode === 'crawl' && v.seedUrls
            ? v.seedUrls
                .trim()
                .split(/\n/)
                .map((s: string) => s.trim())
                .filter((u: string) => /^https?:\/\//i.test(u))
            : undefined,
        urls: v.mode === 'list' && v.urls ? v.urls.trim().split(/\n/).map((s: string) => s.trim()).filter(Boolean) : [],
        cronExpression: v.cronExpression,
        timezone: v.timezone || 'Europe/Moscow',
        endAt: v.endAt ? new Date(v.endAt).getTime() : null,
        forbiddenTerms: v.forbiddenTerms ? v.forbiddenTerms.trim().split(/\n/).map((s: string) => s.trim()).filter(Boolean) : [],
        telegramChatId: v.telegramChatId || null,
        telegramBotToken: v.telegramBotToken || null,
        enabled: v.enabled !== false,
      };
      if (editingId) {
        await updateSchedule(editingId, body);
        message.success('Расписание обновлено');
      } else {
        await createSchedule(body);
        message.success('Расписание создано');
      }
      setModalOpen(false);
      setEditingId(null);
      form.resetFields();
      load();
    } catch (e) {
      if ((e as { errorFields?: unknown[] }).errorFields) return;
      message.error((e as Error).message);
    }
  };

  const openEdit = (s: Schedule) => {
    setEditingId(s.id);
    form.setFieldsValue({
      name: s.name,
      mode: s.mode,
      seedUrls: Array.isArray(s.seedUrls) ? s.seedUrls.join('\n') : s.seedUrl || '',
      urls: Array.isArray(s.urls) ? s.urls.join('\n') : '',
      cronExpression: s.cronExpression,
      timezone: s.timezone || 'Europe/Moscow',
      endAt: s.endAt ? new Date(s.endAt).toISOString().slice(0, 16) : undefined,
      forbiddenTerms: Array.isArray(s.forbiddenTerms) ? s.forbiddenTerms.join('\n') : '',
      telegramChatId: s.telegramChatId || '',
      telegramBotToken: s.telegramBotToken || '',
      enabled: s.enabled,
    });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSchedule(id);
      message.success('Удалено');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: Schedule) => (
        <Space>
          <Typography.Text strong>{name || 'Без названия'}</Typography.Text>
          <Tag>{r.mode === 'crawl' ? 'Обход' : 'Список'}</Tag>
        </Space>
      ),
    },
    {
      title: 'URL / сайт',
      key: 'url',
      render: (_: unknown, r: Schedule) =>
        r.mode === 'crawl'
          ? (r.seedUrls?.length
              ? r.seedUrls.length === 1
                ? r.seedUrls[0]
                : `${r.seedUrls.length} сайтов`
              : '—')
          : (r.urls?.length ? `${r.urls.length} URL` : '—'),
    },
    {
      title: 'Cron',
      dataIndex: 'cronExpression',
      key: 'cron',
      width: 140,
    },
    {
      title: 'След. запуск',
      dataIndex: 'nextRunAt',
      key: 'nextRunAt',
      width: 160,
      render: (ts: number | null) => formatDate(ts),
    },
    {
      title: 'Статус',
      key: 'status',
      width: 180,
      render: (_: unknown, r: Schedule) =>
        r.runningJobId ? (
          <Space>
            <Tag icon={<SyncOutlined spin />} color="processing">
              Идёт проверка
            </Tag>
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              href={`/?jobId=${encodeURIComponent(r.runningJobId!)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть
            </Button>
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'Лог',
      key: 'runLog',
      width: 280,
      render: (_: unknown, r: Schedule) =>
        r.runLog?.length ? (
          <div style={{ fontSize: 12 }}>
            {r.runLog.slice(0, 3).map((entry) => (
              <div key={entry.id}>
                {formatDate(entry.createdAt)} — {formatLogEvent(entry.event)}
              </div>
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'Уведомления',
      key: 'telegram',
      width: 100,
      render: (_: unknown, r: Schedule) =>
        r.telegramChatId ? <Tag color="green">Telegram</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Вкл',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 70,
      render: (enabled: boolean) => <Tag color={enabled ? 'green' : 'default'}>{enabled ? 'Да' : 'Нет'}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_: unknown, r: Schedule) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            Изменить
          </Button>
          <Popconfirm title="Удалить расписание?" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Расписания проверок"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Автоматический запуск обхода сайта по расписанию (cron). При обнаружении запрещённых слов или ошибок
          отправляется уведомление в Telegram. Требуется PostgreSQL и переменные TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID на сервере.
        </Typography.Paragraph>
        <Table
          loading={loading}
          dataSource={schedules}
          rowKey="id"
          columns={columns}
          pagination={false}
          size="small"
        />
      </Card>

      <Modal
        title={editingId ? 'Изменить расписание' : 'Новое расписание'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditingId(null); form.resetFields(); }}
        width={560}
        okText={editingId ? 'Сохранить' : 'Создать'}
      >
        <Form form={form} layout="vertical" initialValues={{ mode: 'crawl', timezone: 'Europe/Moscow', enabled: true }}>
          <Form.Item name="name" label="Название">
            <Input placeholder="Например: Обход example.com" />
          </Form.Item>
          <Form.Item name="mode" label="Режим" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'crawl', label: 'Обход сайта (crawl)' },
                { value: 'list', label: 'Список URL' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.mode !== curr.mode}>
            {({ getFieldValue }) =>
              getFieldValue('mode') === 'crawl' ? (
                <Form.Item
                  name="seedUrls"
                  label="Стартовые URL (по одному на строку)"
                  rules={[{ required: true, message: 'Укажите хотя бы один URL' }]}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder="https://example.com&#10;https://other-site.com"
                  />
                </Form.Item>
              ) : (
                <Form.Item name="urls" label="URL (по одному на строку)" rules={[{ required: true, message: 'Укажите URL' }]}>
                  <Input.TextArea rows={3} placeholder="https://example.com/page1&#10;https://example.com/page2" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item
            name="cronExpression"
            label="Расписание (cron)"
            rules={[{ required: true, message: 'Укажите выражение cron' }]}
            extra={
              <span>
                Формат: минута час день месяц день_недели. Примеры: 0 9 * * * — каждый день в 09:00; 0 9,18 * * * — в 09:00 и 18:00; 0 9 * * 1-5 — по будням в 09:00
              </span>
            }
          >
            <Input placeholder="0 9 * * *" />
          </Form.Item>
          <Form.Item name="timezone" label="Часовой пояс">
            <Select
              options={[
                { value: 'Europe/Moscow', label: 'Москва' },
                { value: 'UTC', label: 'UTC' },
                { value: 'Europe/Kiev', label: 'Киев' },
              ]}
            />
          </Form.Item>
          <Form.Item name="endAt" label="Действует до (необязательно)">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="forbiddenTerms" label="Запрещённые слова (по одному на строку)">
            <Input.TextArea rows={2} placeholder="слово1&#10;слово2" />
          </Form.Item>
          <Form.Item name="telegramChatId" label="Telegram Chat ID (если пусто — из настроек сервера)">
            <Input placeholder="860003314" />
          </Form.Item>
          <Form.Item name="telegramBotToken" label="Telegram Bot Token (если пусто — из настроек сервера)">
            <Input.Password placeholder="Токен бота" />
          </Form.Item>
          <Form.Item name="enabled" label="Включено" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
