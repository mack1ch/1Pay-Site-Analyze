import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { verifyPin, type VerifyPinResponse } from './api';

const { Title, Text } = Typography;

interface PinGateProps {
  onSuccess: () => void;
}

function formatBlockedUntil(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function PinGate({ onSuccess }: PinGateProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);

  const handleFinish = async (values: { pin: string }) => {
    setError(null);
    setRemainingAttempts(null);
    setBlockedUntil(null);
    setLoading(true);
    try {
      const result: VerifyPinResponse = await verifyPin(values.pin);
      if (result.ok) {
        onSuccess();
        return;
      }
      setError(result.error ?? 'Ошибка входа');
      if (result.blocked && result.blockedUntil) {
        setBlockedUntil(result.blockedUntil);
      } else if (result.remainingAttempts != null) {
        setRemainingAttempts(result.remainingAttempts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      }}
    >
      <Card
        style={{ maxWidth: 400, width: '100%' }}
        styles={{ body: { padding: '32px 24px' } }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <LockOutlined style={{ fontSize: 48, color: '#6366f1', marginBottom: 16 }} />
            <Title level={3} style={{ marginBottom: 8 }}>
              Вход в систему
            </Title>
            <Text type="secondary">Введите пин-код для доступа к мониторингу</Text>
          </div>

          {error && (
            <Alert
              type={blockedUntil ? 'warning' : 'error'}
              showIcon
              message={error}
              description={
                blockedUntil
                  ? `Повторите попытку после ${formatBlockedUntil(blockedUntil)}`
                  : remainingAttempts != null
                    ? `Осталось попыток: ${remainingAttempts}`
                    : undefined
              }
            />
          )}

          <Form
            name="pin"
            onFinish={handleFinish}
            autoComplete="off"
            size="large"
            disabled={!!blockedUntil}
          >
            <Form.Item
              name="pin"
              rules={[{ required: true, message: 'Введите пин-код' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Пин-код"
                autoFocus
                maxLength={20}
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                disabled={!!blockedUntil}
              >
                Войти
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
}
