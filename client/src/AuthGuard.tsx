import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import { getAuthStatus } from './api';
import PinGate from './PinGate';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const res = await getAuthStatus();
      setAuthenticated(res.ok);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#141414',
        }}
      >
        <Spin size="large" tip="Загрузка..." />
      </div>
    );
  }

  if (!authenticated) {
    return <PinGate onSuccess={() => setAuthenticated(true)} />;
  }

  return <>{children}</>;
}
