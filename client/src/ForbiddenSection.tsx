import { useState, useRef } from 'react';
import { Card, Input, Select, InputNumber, Checkbox, Button, Form, Row, Col, Alert, Tooltip, Space } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { parseForbiddenTermsFromCsv, parseForbiddenTermsFromText } from './parseForbiddenTerms';
import type {
  ForbiddenSettings,
  ForbiddenMatchMode,
  ForbiddenLanguageMode,
  ForbiddenPhraseMode,
} from './api';

interface ForbiddenSectionProps {
  terms: string[];
  onTermsChange: (terms: string[]) => void;
  settings: ForbiddenSettings;
  onSettingsChange: (s: ForbiddenSettings) => void;
  disabled?: boolean;
}

export function ForbiddenSection({
  terms,
  onTermsChange,
  settings,
  onSettingsChange,
  disabled,
}: ForbiddenSectionProps) {
  const [rawText, setRawText] = useState('');
  const [csvFile, setCsvFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveTerms = (() => {
    if (csvFile?.trim()) {
      const fromCsv = parseForbiddenTermsFromCsv(csvFile);
      if (fromCsv.length > 0) return fromCsv;
    }
    return parseForbiddenTermsFromText(rawText);
  })();
  const deduped = [...new Set(effectiveTerms.map((t) => t.trim().toLowerCase()))];
  const displayCount = terms.length > 0 ? terms.length : deduped.length;

  const syncTerms = () => {
    if (csvFile?.trim()) {
      const fromCsv = parseForbiddenTermsFromCsv(csvFile);
      if (fromCsv.length > 0) {
        onTermsChange(fromCsv);
        return;
      }
    }
    onTermsChange(parseForbiddenTermsFromText(rawText));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvFile(reader.result as string);
      onTermsChange(parseForbiddenTermsFromCsv(reader.result as string));
    };
    reader.readAsText(file, 'UTF-8');
  };

  return (
    <Card title="Запрещённые слова" style={{ marginBottom: 16 }}>
      <Form layout="vertical">
        <Form.Item label="Запрещённые слова (по одному на строку)">
          <Input.TextArea
            placeholder="арбуз&#10;запрещённое_слово"
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              onTermsChange(parseForbiddenTermsFromText(e.target.value));
            }}
            onBlur={syncTerms}
            rows={4}
            disabled={disabled}
          />
        </Form.Item>
        <Space style={{ marginBottom: 16 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <Button onClick={() => fileInputRef.current?.click()}>Загрузить слова из CSV</Button>
        </Space>
        <div style={{ color: 'var(--ant-color-text-secondary)', marginBottom: 16 }}>
          Загружено: {displayCount} слов (без дубликатов)
        </div>

        <Row gutter={[16, 8]}>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label={
                <Space size={4}>
                  <span>Режим совпадения</span>
                  <Tooltip title="Как искать слово: точная подстрока, целое слово, по основе слова (например «игра» найдёт «игры») или с учётом опечаток.">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
            >
              <Select
                value={settings.matchMode ?? 'smart_stem'}
                onChange={(v) => onSettingsChange({ ...settings, matchMode: v as ForbiddenMatchMode })}
                style={{ width: '100%' }}
                options={[
                  { value: 'exact_substring', label: 'Точная подстрока' },
                  { value: 'word', label: 'Целое слово' },
                  { value: 'smart_stem', label: 'По основе слова (рекомендуется)' },
                  { value: 'smart_fuzzy', label: 'С учётом опечаток' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label={
                <Space size={4}>
                  <span>Язык</span>
                  <Tooltip title="Язык текста для правильного поиска по основам слов. «Авто» — определяется автоматически.">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
            >
              <Select
                value={settings.languageMode ?? 'auto'}
                onChange={(v) =>
                  onSettingsChange({ ...settings, languageMode: v as ForbiddenLanguageMode })
                }
                style={{ width: '100%' }}
                options={[
                  { value: 'auto', label: 'Авто' },
                  { value: 'ru', label: 'Русский' },
                  { value: 'en', label: 'Английский' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label={
                <Space size={4}>
                  <span>Поиск фраз</span>
                  <Tooltip title="Искать целые фразы (несколько слов подряд), а не отдельные слова.">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
            >
              <Select
                value={settings.phraseMode ?? 'disabled'}
                onChange={(v) =>
                  onSettingsChange({ ...settings, phraseMode: v as ForbiddenPhraseMode })
                }
                style={{ width: '100%' }}
                options={[
                  { value: 'disabled', label: 'Выкл' },
                  { value: 'token_stem_sequence', label: 'Вкл (по основам слов)' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item>
              <Space size={4}>
                <Checkbox
                  checked={settings.caseSensitive ?? false}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, caseSensitive: e.target.checked })
                  }
                >
                  Учитывать регистр
                </Checkbox>
                <Tooltip title="Если включено, «Слово» и «слово» будут считаться разными.">
                  <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                </Tooltip>
              </Space>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label={
                <Space size={4}>
                  <span>Мин. длина слова</span>
                  <Tooltip title="Слова короче этой длины не участвуют в поиске. Помогает отсечь «мусор» и сокращения.">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
            >
              <InputNumber
                min={1}
                max={20}
                value={settings.minWordLength ?? 3}
                onChange={(v) =>
                  onSettingsChange({ ...settings, minWordLength: (v ?? 3) })
                }
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label={
                <Space size={4}>
                  <span>Макс. совпадений на страницу</span>
                  <Tooltip title="Сколько раз показывать одно и то же слово на странице в отчёте. Ограничение нужно, чтобы отчёт не был слишком большим.">
                    <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
            >
              <InputNumber
                min={1}
                max={500}
                value={settings.maxMatchesPerTermPerPage ?? 50}
                onChange={(v) =>
                  onSettingsChange({ ...settings, maxMatchesPerTermPerPage: (v ?? 50) })
                }
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item>
              <Space size={4}>
                <Checkbox
                  checked={settings.fuzzy?.enabled ?? false}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      fuzzy: { ...settings.fuzzy, enabled: e.target.checked },
                    })
                  }
                >
                  Учёт опечаток
                </Checkbox>
                <Tooltip title="Находить слова с небольшими опечатками. Включайте только при необходимости — может давать лишние срабатывания.">
                  <QuestionCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', cursor: 'help' }} />
                </Tooltip>
              </Space>
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <Alert
        type="info"
        showIcon
        message="Режимы smart_* могут давать ложные срабатывания; fuzzy только для опечаток (ограниченно)."
        style={{ marginTop: 16 }}
      />
    </Card>
  );
}
