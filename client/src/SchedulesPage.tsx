import { useState, useEffect, useCallback } from 'react';
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
  InputNumber,
  Select,
  Switch,
  message,
  Popconfirm,
  Progress,
  Collapse,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  LinkOutlined,
  TeamOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import type { Schedule, ScheduleGroup, ScheduleCreate, ScheduleGroupCreate, ScheduleRunLogEntry } from './api';
import {
  getSchedules,
  getScheduleGroups,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  createScheduleGroup,
  updateScheduleGroup,
  deleteScheduleGroup,
  getJob,
  getResults,
} from './api';
import type { JobProgress, ResultItem } from './api';

const MAX_INTERVAL_MINUTES = 30 * 24 * 60; // до месяца

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

function formatInterval(min: number): string {
  if (min < 60) return `каждые ${min} мин`;
  if (min < 24 * 60) return `каждые ${Math.round(min / 60)} ч`;
  return `каждые ${Math.round(min / (24 * 60))} дн`;
}

/** Прогресс и список обработанных сайтов для запущенной проверки (как на главной). */
function ScheduleRunProgress({ jobId }: { jobId: string }) {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);

  const poll = useCallback(async () => {
    try {
      const job = await getJob(jobId);
      setProgress(job.progress);
      const status = job.status || job.progress?.status;
      const limit = status === 'running' || status === 'queued' || status === 'pending' ? 500 : 5000;
      const { items } = await getResults(jobId, 0, limit);
      setResults(items);
    } catch {
      // ignore
    }
  }, [jobId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll]);

  if (!progress) return <Typography.Text type="secondary">Загрузка…</Typography.Text>;

  const total = progress.total ?? progress.queued ?? 0;
  const pct = total > 0 ? Math.round((progress.processed / total) * 100) : 0;
  const isRunning =
    progress.status === 'running' || progress.status === 'pending' || progress.status === 'queued';

  return (
    <div style={{ marginTop: 8 }}>
      <Progress percent={pct} status={isRunning ? 'active' : 'success'} size="small" style={{ marginBottom: 8 }} />
      <Space wrap size="small" style={{ marginBottom: 8 }}>
        <Tag color="blue">Обработано: {progress.processed}</Tag>
        <Tag color="cyan">В очереди: {progress.queued ?? 0}</Tag>
        <Tag color="red">Ошибок: {progress.failed}</Tag>
        <Tag color="orange">Нарушений: {progress.violations ?? 0}</Tag>
      </Space>
      <Button
        type="link"
        size="small"
        icon={<LinkOutlined />}
        href={`/?jobId=${encodeURIComponent(jobId)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Открыть на странице проверки
      </Button>
      {results.length > 0 && (
        <Collapse
          size="small"
          style={{ marginTop: 8 }}
          items={[
            {
              key: 'sites',
              label: `Обработанные сайты (${results.length})`,
              children: (
                <Table
                  size="small"
                  dataSource={results}
                  rowKey={(r) => r.finalUrl || r.url}
                  pagination={{ pageSize: 10, size: 'small' }}
                  columns={[
                    {
                      title: 'URL',
                      dataIndex: 'finalUrl',
                      key: 'url',
                      ellipsis: true,
                      render: (_: unknown, row: ResultItem) => row.finalUrl || row.url,
                    },
                    {
                      title: 'Статус',
                      key: 'status',
                      width: 100,
                      render: (_: unknown, row: ResultItem) => (
                        <Tag color={row.ok ? 'success' : 'error'}>{row.ok ? 'OK' : 'Ошибка'}</Tag>
                      ),
                    },
                    {
                      title: 'Нарушения',
                      key: 'violations',
                      width: 100,
                      render: (_: unknown, row: ResultItem) =>
                        row.forbiddenScan?.hasMatches ? (
                          <Tag color="orange">{row.forbiddenScan.totalMatches}</Tag>
                        ) : (
                          '—'
                        ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

/** Блок логирования: когда следующий запуск, когда запустилось, идёт обработка, какие сайты обработаны. */
function ScheduleLogBlock({
  nextRunAt,
  lastRunAt,
  runLog,
  runningJobId,
}: {
  nextRunAt: number | null;
  lastRunAt: number | null;
  runLog?: ScheduleRunLogEntry[];
  runningJobId?: string | null;
}) {
  const running = !!runningJobId;
  const lastStarted = runLog?.filter((e) => e.event === 'started').sort((a, b) => b.createdAt - a.createdAt)[0];
  return (
    <Card type="inner" size="small" title="Лог и статус" style={{ marginTop: 12 }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {nextRunAt != null && (
          <div>
            <Typography.Text type="secondary">Следующий запуск: </Typography.Text>
            <Typography.Text strong>{formatDate(nextRunAt)}</Typography.Text>
          </div>
        )}
        {lastStarted && (
          <div>
            <Typography.Text type="secondary">Запущено в: </Typography.Text>
            <Typography.Text>{formatDate(lastStarted.createdAt)}</Typography.Text>
          </div>
        )}
        {runLog && runLog.length > 0 && (
          <div>
            <Typography.Text type="secondary">Последние события: </Typography.Text>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {runLog.slice(0, 5).map((entry) => (
                <div key={entry.id}>
                  {formatDate(entry.createdAt)} — {formatLogEvent(entry.event)}
                </div>
              ))}
            </div>
          </div>
        )}
        {running && runningJobId && (
          <>
            <Tag icon={<SyncOutlined spin />} color="processing">
              Идёт обработка
            </Tag>
            <ScheduleRunProgress jobId={runningJobId} />
          </>
        )}
        {!running && lastRunAt != null && (
          <div>
            <Typography.Text type="secondary">Последний запуск: </Typography.Text>
            <Typography.Text>{formatDate(lastRunAt)}</Typography.Text>
          </div>
        )}
      </Space>
    </Card>
  );
}

export function SchedulesPage() {
  const [groups, setGroups] = useState<ScheduleGroup[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null);
  const [groupForm] = Form.useForm();
  const [scheduleForm] = Form.useForm();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [groupsRes, schedulesRes] = await Promise.all([getScheduleGroups(), getSchedules()]);
      setGroups(groupsRes.groups);
      setSchedules(schedulesRes.schedules.filter((s) => !s.groupId));
    } catch (e) {
      if (!silent) message.error((e as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => load(true), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const handleGroupSubmit = async () => {
    try {
      const v = await groupForm.validateFields();
      const body: ScheduleGroupCreate = {
        name: v.name || '',
        intervalMinutes: Math.max(1, Math.min(MAX_INTERVAL_MINUTES, Number(v.intervalMinutes) || 60)),
        timezone: v.timezone || 'Europe/Moscow',
        endAt: v.endAt ? new Date(v.endAt).getTime() : null,
        enabled: v.enabled !== false,
      };
      if (editingGroupId) {
        await updateScheduleGroup(editingGroupId, body);
        message.success('Группа обновлена');
      } else {
        await createScheduleGroup(body);
        message.success('Группа создана');
      }
      setGroupModalOpen(false);
      setEditingGroupId(null);
      groupForm.resetFields();
      load();
    } catch (e) {
      if ((e as { errorFields?: unknown[] }).errorFields) return;
      message.error((e as Error).message);
    }
  };

  const handleScheduleSubmit = async () => {
    try {
      const v = await scheduleForm.validateFields();
      const groupId = addToGroupId || undefined;
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
        urls:
          v.mode === 'list' && v.urls
            ? v.urls
                .trim()
                .split(/\n/)
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [],
        cronExpression: groupId ? undefined : (v.cronExpression || '').trim(),
        timezone: v.timezone || 'Europe/Moscow',
        endAt: v.endAt ? new Date(v.endAt).getTime() : null,
        forbiddenTerms: v.forbiddenTerms
          ? v.forbiddenTerms
              .trim()
              .split(/\n/)
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
        telegramChatId: v.telegramChatId || null,
        telegramBotToken: v.telegramBotToken || null,
        enabled: v.enabled !== false,
        groupId: groupId || null,
        sortOrder: v.sortOrder ?? 0,
      };
      if (editingId) {
        await updateSchedule(editingId, body);
        message.success('Расписание обновлено');
      } else {
        await createSchedule(body);
        message.success('Расписание добавлено');
      }
      setScheduleModalOpen(false);
      setEditingId(null);
      setAddToGroupId(null);
      scheduleForm.resetFields();
      load();
    } catch (e) {
      if ((e as { errorFields?: unknown[] }).errorFields) return;
      message.error((e as Error).message);
    }
  };

  const openEditSchedule = (s: Schedule) => {
    setEditingId(s.id);
    setAddToGroupId(s.groupId ?? null);
    scheduleForm.setFieldsValue({
      name: s.name,
      mode: s.mode,
      seedUrls: Array.isArray(s.seedUrls) ? s.seedUrls.join('\n') : s.seedUrl || '',
      urls: Array.isArray(s.urls) ? s.urls.join('\n') : '',
      cronExpression: s.cronExpression || '',
      timezone: s.timezone || 'Europe/Moscow',
      endAt: s.endAt ? new Date(s.endAt).toISOString().slice(0, 16) : undefined,
      forbiddenTerms: Array.isArray(s.forbiddenTerms) ? s.forbiddenTerms.join('\n') : '',
      telegramChatId: s.telegramChatId || '',
      telegramBotToken: s.telegramBotToken || '',
      enabled: s.enabled,
      sortOrder: s.sortOrder ?? 0,
    });
    setScheduleModalOpen(true);
  };

  const openAddScheduleToGroup = (groupId: string) => {
    setEditingId(null);
    setAddToGroupId(groupId);
    scheduleForm.resetFields();
    scheduleForm.setFieldsValue({ mode: 'list', timezone: 'Europe/Moscow', enabled: true, sortOrder: 0 });
    setScheduleModalOpen(true);
  };

  const openEditGroup = (g: ScheduleGroup) => {
    setEditingGroupId(g.id);
    groupForm.setFieldsValue({
      name: g.name,
      intervalMinutes: g.intervalMinutes,
      timezone: g.timezone || 'Europe/Moscow',
      endAt: g.endAt ? new Date(g.endAt).toISOString().slice(0, 16) : undefined,
      enabled: g.enabled,
    });
    setGroupModalOpen(true);
  };

  const openAddGroup = () => {
    setEditingGroupId(null);
    groupForm.resetFields();
    groupForm.setFieldsValue({ intervalMinutes: 60, timezone: 'Europe/Moscow', enabled: true });
    setGroupModalOpen(true);
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await deleteSchedule(id);
      message.success('Удалено');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await deleteScheduleGroup(id);
      message.success('Группа удалена');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const cronColumns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string, r: Schedule) => (
        <Space size="small">
          <Typography.Text strong ellipsis style={{ maxWidth: 140 }}>
            {name || 'Без названия'}
          </Typography.Text>
          <Tag>{r.mode === 'crawl' ? 'Обход' : 'Список'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Cron',
      dataIndex: 'cronExpression',
      key: 'cron',
      width: 120,
    },
    {
      title: 'След. запуск',
      dataIndex: 'nextRunAt',
      key: 'nextRunAt',
      width: 150,
      render: (ts: number | null) => formatDate(ts),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      render: (_: unknown, r: Schedule) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditSchedule(r)}>
            Изменить
          </Button>
          <Popconfirm title="Удалить?" onConfirm={() => handleDeleteSchedule(r.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <TeamOutlined />
            Группы расписаний (раз в N минут)
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddGroup}>
            Добавить группу
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Группа запускает все свои проверки по одному таймеру: интервал от 1 минуты до 30 дней. Добавьте в группу
          один или несколько списков/обходов — они будут выполняться по очереди в указанное время.
        </Typography.Paragraph>
        {groups.length === 0 && !loading ? (
          <Typography.Text type="secondary">Нет групп. Создайте группу и добавьте в неё расписания.</Typography.Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {groups.map((g) => (
              <Card
                key={g.id}
                type="inner"
                title={
                  <Space>
                    <Typography.Text strong>{g.name || 'Без названия'}</Typography.Text>
                    <Tag>{formatInterval(g.intervalMinutes)}</Tag>
                    {!g.enabled && <Tag color="default">Выкл</Tag>}
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditGroup(g)} />
                    <Popconfirm title="Удалить группу и все её расписания?" onConfirm={() => handleDeleteGroup(g.id)}>
                      <Button type="link" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                }
                extra={
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => openAddScheduleToGroup(g.id)}
                  >
                    Добавить список в группу
                  </Button>
                }
              >
                <div>
                  <Typography.Text type="secondary">Следующий запуск: </Typography.Text>
                  <Typography.Text strong>{formatDate(g.nextRunAt)}</Typography.Text>
                </div>
                {g.schedules?.length > 0 && (
                  <Table
                    size="small"
                    style={{ marginTop: 12 }}
                    dataSource={g.schedules}
                    rowKey="id"
                    pagination={false}
                    columns={[
                      {
                        title: 'Название',
                        dataIndex: 'name',
                        key: 'name',
                        render: (name: string, r: Schedule) => (
                          <Space>
                            <span>{name || '—'}</span>
                            <Tag>{r.mode === 'crawl' ? 'Обход' : 'Список'}</Tag>
                          </Space>
                        ),
                      },
                      {
                        title: 'URL',
                        key: 'url',
                        ellipsis: true,
                        render: (_: unknown, r: Schedule) =>
                          r.mode === 'crawl'
                            ? (r.seedUrls?.length ? `${r.seedUrls.length} стартовых` : '—')
                            : (r.urls?.length ? `${r.urls.length} URL` : '—'),
                      },
                      {
                        title: '',
                        key: 'actions',
                        width: 100,
                        render: (_: unknown, r: Schedule) => (
                          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditSchedule(r)}>
                            Изменить
                          </Button>
                        ),
                      },
                    ]}
                  />
                )}
                <ScheduleLogBlock
                  nextRunAt={g.nextRunAt}
                  lastRunAt={g.lastRunAt}
                  runLog={g.schedules?.[0]?.runLog}
                  runningJobId={g.runningJobId}
                />
              </Card>
            ))}
          </Space>
        )}
      </Card>

      <Card
        style={{ marginTop: 24 }}
        title={
          <Space>
            <CalendarOutlined />
            Отдельные расписания (cron)
          </Space>
        }
        extra={
          <Button
            type="default"
            icon={<PlusOutlined />}
            onClick={() => {
              setAddToGroupId(null);
              setEditingId(null);
              scheduleForm.resetFields();
              scheduleForm.setFieldsValue({ mode: 'list', timezone: 'Europe/Moscow', enabled: true, cronExpression: '0 9 * * *' });
              setScheduleModalOpen(true);
            }}
          >
            Добавить по cron
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Расписания без группы запускаются по cron-выражению (минута, час, день, месяц, день недели).
        </Typography.Paragraph>
        <Table
          loading={loading}
          dataSource={schedules}
          rowKey="id"
          columns={cronColumns}
          pagination={false}
          size="small"
          expandable={{
            expandedRowRender: (record: Schedule) => (
              <ScheduleLogBlock
                nextRunAt={record.nextRunAt}
                lastRunAt={record.lastRunAt}
                runLog={record.runLog}
                runningJobId={record.runningJobId}
              />
            ),
            rowExpandable: () => true,
          }}
        />
      </Card>

      <Modal
        title={editingGroupId ? 'Изменить группу' : 'Новая группа'}
        open={groupModalOpen}
        onOk={handleGroupSubmit}
        onCancel={() => {
          setGroupModalOpen(false);
          setEditingGroupId(null);
          groupForm.resetFields();
        }}
        width={440}
        okText={editingGroupId ? 'Сохранить' : 'Создать'}
      >
        <Form form={groupForm} layout="vertical" initialValues={{ intervalMinutes: 60, timezone: 'Europe/Moscow', enabled: true }}>
          <Form.Item name="name" label="Название группы">
            <Input placeholder="Например: Ежедневные проверки" />
          </Form.Item>
          <Form.Item
            name="intervalMinutes"
            label="Интервал (минуты)"
            rules={[
              { required: true },
              { type: 'number', min: 1, max: MAX_INTERVAL_MINUTES, message: `От 1 до ${MAX_INTERVAL_MINUTES} (30 дней)` },
            ]}
            extra={`От 1 минуты до ${MAX_INTERVAL_MINUTES} (30 дней). Пример: 60 = каждый час, 1440 = раз в день.`}
          >
            <InputNumber min={1} max={MAX_INTERVAL_MINUTES} style={{ width: '100%' }} />
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
          <Form.Item name="enabled" label="Включено" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={addToGroupId ? 'Добавить в группу' : editingId ? 'Изменить расписание' : 'Новое расписание (cron)'}
        open={scheduleModalOpen}
        onOk={handleScheduleSubmit}
        onCancel={() => {
          setScheduleModalOpen(false);
          setEditingId(null);
          setAddToGroupId(null);
          scheduleForm.resetFields();
        }}
        width={560}
        okText={editingId || addToGroupId ? 'Сохранить' : 'Создать'}
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          initialValues={{ mode: 'list', timezone: 'Europe/Moscow', enabled: true, cronExpression: '0 9 * * *' }}
        >
          <Form.Item name="name" label="Название">
            <Input placeholder="Например: Список сайтов X" />
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
                  <Input.TextArea rows={4} placeholder="https://example.com" />
                </Form.Item>
              ) : (
                <Form.Item
                  name="urls"
                  label="URL (по одному на строку)"
                  rules={[{ required: true, message: 'Укажите URL' }]}
                >
                  <Input.TextArea rows={3} placeholder="https://example.com/page1" />
                </Form.Item>
              )
            }
          </Form.Item>
          {!addToGroupId && (
            <Form.Item
              name="cronExpression"
              label="Cron"
              rules={[{ required: true, message: 'Укажите выражение cron' }]}
              extra="Примеры: 0 9 * * * — каждый день в 09:00; */30 * * * * — каждые 30 мин"
            >
              <Input placeholder="0 9 * * *" />
            </Form.Item>
          )}
          {addToGroupId && (
            <Form.Item name="sortOrder" label="Порядок в группе" initialValue={0}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          )}
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
          <Form.Item name="telegramChatId" label="Telegram Chat ID">
            <Input placeholder="если пусто — из настроек сервера" />
          </Form.Item>
          <Form.Item name="telegramBotToken" label="Telegram Bot Token">
            <Input.Password placeholder="если пусто — из настроек сервера" />
          </Form.Item>
          <Form.Item name="enabled" label="Включено" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
