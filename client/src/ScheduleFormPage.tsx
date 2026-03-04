import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, Button, Form, Input, InputNumber, Select, Switch, Space, Typography, message, Radio } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { InputSection } from './InputSection';
import { ForbiddenSection } from './ForbiddenSection';
import type { Schedule, ScheduleCreate, ForbiddenSettings } from './api';
import {
  getSchedule,
  getScheduleGroups,
  createSchedule,
  updateSchedule,
} from './api';

export function ScheduleFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId');
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string; intervalMinutes: number }[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [forbiddenTerms, setForbiddenTerms] = useState<string[]>([]);
  const [forbiddenSettings, setForbiddenSettings] = useState<ForbiddenSettings>({});
  const [form] = Form.useForm();
  const inputRef = useRef<{ getValues: () => { mode: 'list' | 'crawl'; urls: string[]; options: import('./api').JobOptions } | null }>(null);

  useEffect(() => {
    if (id) {
      getSchedule(id)
        .then(setSchedule)
        .catch(() => message.error('Расписание не найдено'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    getScheduleGroups()
      .then((r) => setGroups(r.groups.map((g) => ({ id: g.id, name: g.name || 'Без названия', intervalMinutes: g.intervalMinutes }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (schedule) {
      setForbiddenTerms(schedule.forbiddenTerms ?? []);
      setForbiddenSettings((schedule.forbiddenSettings as ForbiddenSettings) ?? {});
      form.setFieldsValue({
        name: schedule.name,
        cronExpression: schedule.cronExpression || '0 9 * * *',
        timezone: schedule.timezone || 'Europe/Moscow',
        endAt: schedule.endAt ? new Date(schedule.endAt).toISOString().slice(0, 16) : undefined,
        telegramChatId: schedule.telegramChatId || '',
        telegramBotToken: schedule.telegramBotToken || '',
        enabled: schedule.enabled,
        notifyAlways: schedule.notifyAlways ?? false,
        groupId: schedule.groupId || undefined,
        sortOrder: schedule.sortOrder ?? 0,
      });
    } else if (!id) {
      form.setFieldsValue({
        name: '',
        cronExpression: '0 9 * * *',
        timezone: 'Europe/Moscow',
        enabled: true,
        notifyAlways: false,
        groupId: groupId || undefined,
        sortOrder: 0,
      });
      if (groupId) setForbiddenTerms([]);
    }
  }, [schedule, id, groupId, form]);

  const crawlOpts = schedule?.options?.crawl as { crawlMode?: 'submitted_only' | 'seed_only' | 'crawl'; maxPages?: number; maxDepth?: number; sameHostOnly?: boolean } | undefined;
  const initialInputValues = schedule
    ? {
        mode: schedule.mode as 'list' | 'crawl',
        rawUrls: schedule.mode === 'list' ? (schedule.urls || []).join('\n') : '',
        seedUrlsText: schedule.mode === 'crawl' ? (schedule.seedUrls || []).join('\n') : '',
        crawlMode: (crawlOpts?.crawlMode ?? 'crawl') as 'submitted_only' | 'seed_only' | 'crawl',
        maxPages: crawlOpts?.maxPages ?? 50,
        maxDepth: crawlOpts?.maxDepth ?? 2,
        sameHostOnly: crawlOpts?.sameHostOnly ?? true,
        useBrowserFetch: Boolean(schedule.options?.useBrowserFetch),
      }
    : undefined;

  const handleSubmit = async () => {
    const values = inputRef.current?.getValues();
    if (!values) {
      message.error('Укажите URL (список или стартовые для обхода)');
      return;
    }
    const formValues = await form.validateFields().catch(() => null);
    if (!formValues) return;

    const body: ScheduleCreate = {
      name: formValues.name || '',
      mode: values.mode,
      seedUrls: values.mode === 'crawl' ? values.urls : undefined,
      urls: values.mode === 'list' ? values.urls : [],
      cronExpression: formValues.groupId ? undefined : (formValues.cronExpression || '').trim(),
      timezone: formValues.timezone || 'Europe/Moscow',
      endAt: formValues.endAt ? new Date(formValues.endAt).getTime() : null,
      options: { ...(schedule?.options ?? {}), ...values.options },
      forbiddenTerms,
      forbiddenSettings: forbiddenSettings as Record<string, unknown>,
      telegramChatId: formValues.telegramChatId || null,
      telegramBotToken: formValues.telegramBotToken || null,
      enabled: formValues.enabled !== false,
      notifyAlways: formValues.notifyAlways === true,
      groupId: formValues.groupId || null,
      sortOrder: formValues.sortOrder ?? 0,
    };

    if (!body.groupId && !body.cronExpression) {
      message.error('Укажите cron или выберите группу');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && id) {
        await updateSchedule(id, body);
        message.success('Расписание обновлено');
      } else {
        await createSchedule(body);
        message.success('Расписание создано');
      }
      navigate('/schedules');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <Typography.Text>Загрузка…</Typography.Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/schedules')}
        style={{ marginBottom: 16 }}
      >
        Назад к расписаниям
      </Button>

      <Typography.Title level={4} style={{ marginBottom: 24 }}>
        {isEdit ? 'Редактирование расписания' : groupId ? 'Добавить в группу' : 'Новое расписание'}
      </Typography.Title>

      <InputSection
        ref={inputRef}
        initialValues={initialInputValues}
      />

      <ForbiddenSection
        terms={forbiddenTerms}
        onTermsChange={setForbiddenTerms}
        settings={forbiddenSettings}
        onSettingsChange={setForbiddenSettings}
      />

      <Card title="Расписание" style={{ marginTop: 24, marginBottom: 24 }}>
        <Form form={form} layout="vertical" initialValues={{ timezone: 'Europe/Moscow', enabled: true, notifyAlways: false, sortOrder: 0 }}>
          <Form.Item name="name" label="Название">
            <Input placeholder="Например: Список сайтов X" />
          </Form.Item>
          {!groupId && (
            <Form.Item
              name="cronExpression"
              label="Cron (если не в группе)"
              rules={[{ required: true, message: 'Укажите cron или выберите группу' }]}
              extra="Примеры: 0 9 * * * — каждый день в 09:00; */30 * * * * — каждые 30 мин"
            >
              <Input placeholder="0 9 * * *" />
            </Form.Item>
          )}
          {groupId ? (
            <Form.Item name="groupId" hidden initialValue={groupId}>
              <Input type="hidden" />
            </Form.Item>
          ) : groups.length > 0 ? (
            <Form.Item name="groupId" label="Группа (таймер по интервалу)">
              <Select
                allowClear
                placeholder="Без группы (тогда обязателен cron)"
                options={[{ value: '', label: '— Без группы —' }, ...groups.map((g) => ({ value: g.id, label: `${g.name} (каждые ${g.intervalMinutes} мин)` }))]}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="sortOrder" label="Порядок в группе">
            <InputNumber min={0} style={{ width: 120 }} />
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
          <Form.Item name="telegramChatId" label="Telegram Chat ID">
            <Input placeholder="если пусто — из настроек сервера" />
          </Form.Item>
          <Form.Item name="telegramBotToken" label="Telegram Bot Token">
            <Input.Password placeholder="если пусто — из настроек сервера" />
          </Form.Item>
          <Form.Item name="notifyAlways" label="Уведомления в Telegram">
            <Radio.Group>
              <Radio value={false}>Только при ошибках или нарушениях</Radio>
              <Radio value={true}>Всегда (включая успешные проверки)</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="enabled" label="Включено" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
        <Space>
          <Button type="primary" onClick={handleSubmit} loading={saving}>
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
          <Button onClick={() => navigate('/schedules')}>Отмена</Button>
        </Space>
      </Card>
    </div>
  );
}
